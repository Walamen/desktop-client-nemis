import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewSchoolRegistration } from '@nemis-desktop/application';
import type { SchoolRegistrationPayload } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteSchoolRegistrationStore } from './SqliteSchoolRegistrationStore';

const NOW = '2026-10-17T09:00:00.000Z';

const payload = (name: string, code: string): SchoolRegistrationPayload => ({
  name,
  code,
  type: 'SCHOOL',
  levels: ['PRIMARY'],
  ownership: 'GOVERNMENT',
  countyId: 'county-1',
  districtId: 'd-1',
  isActive: true,
  admins: [{ email: 'ada@school.lr', firstName: 'Ada', lastName: 'Doe' }],
});

const row = (id: string, extra: Partial<NewSchoolRegistration> = {}): NewSchoolRegistration => ({
  id,
  countyId: 'county-1',
  createdBy: 'u-1',
  source: 'form',
  payload: payload(`School ${id}`, `GB-${id}`),
  now: NOW,
  ...extra,
});

describe('SqliteSchoolRegistrationStore', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let store: SqliteSchoolRegistrationStore;

  const setState = (id: string, syncState: string, extra = '') =>
    db.prepare(`UPDATE school_registrations SET syncState = ?${extra} WHERE id = ?`).run(syncState, id);

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    store = new SqliteSchoolRegistrationStore(test.context);
    db.prepare(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`).run();
  });
  afterEach(() => test.cleanup());

  it('insertMany writes every row in one transaction; a bad row saves none', () => {
    const rows = Array.from({ length: 200 }, (_, i) => row(`r-${i}`));
    rows[149] = row('r-0');
    expect(() => store.insertMany(rows)).toThrow();
    expect(db.prepare(`SELECT COUNT(*) n FROM school_registrations`).get()).toEqual({ n: 0 });

    store.insertMany(Array.from({ length: 200 }, (_, i) => row(`r-${i}`)));
    expect(db.prepare(`SELECT COUNT(*) n FROM school_registrations`).get()).toEqual({ n: 200 });
  });

  it('listForUser and getForUser hide other users and other counties', () => {
    store.insertMany([
      row('mine'),
      row('theirs', { createdBy: 'u-2' }),
      row('elsewhere', { countyId: 'county-2' }),
    ]);
    expect(store.listForUser('u-1').map((r) => r.id)).toEqual(['mine']);
    expect(store.listForUser('u-1', ['theirs', 'elsewhere'])).toEqual([]);
    expect(store.getForUser('theirs', 'u-1')).toBeNull();
    expect(store.getForUser('elsewhere', 'u-1')).toBeNull();
    expect(store.getForUser('mine', 'u-1')).toMatchObject({
      id: 'mine',
      countyId: 'county-1',
      source: 'form',
      syncState: 'pending',
      syncError: null,
      principalLogin: null,
      createdAt: NOW,
      updatedAt: NOW,
      syncedAt: null,
      payload: { name: 'School mine', code: 'GB-mine' },
    });
  });

  it('maps the principal login only when both columns are set, and skips a corrupt payload', () => {
    store.insertMany([row('a'), row('b'), row('bad')]);
    db.prepare(`UPDATE school_registrations SET principalEmail='ada@school.lr', principalPassword='Nemis@123' WHERE id='a'`).run();
    db.prepare(`UPDATE school_registrations SET principalEmail='ada@school.lr' WHERE id='b'`).run();
    db.prepare(`UPDATE school_registrations SET payload='{not json' WHERE id='bad'`).run();
    expect(store.getForUser('a', 'u-1')!.principalLogin).toEqual({ email: 'ada@school.lr', password: 'Nemis@123' });
    expect(store.getForUser('b', 'u-1')!.principalLogin).toBeNull();
    expect(store.getForUser('bad', 'u-1')).toBeNull();
    expect(store.listForUser('u-1').map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('existingCodes finds institutions and non-rejected registrations, not rejected ones', () => {
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
       VALUES ('i-1','GB-0001','Old School','SCHOOL','GOVERNMENT','county-1','APPROVED',1,?)`,
    ).run(NOW);
    store.insertMany([row('w', { payload: payload('Waiting', 'GB-0002') }), row('x', { payload: payload('Refused', 'GB-0003') })]);
    setState('x', 'rejected');
    expect(store.existingCodes(['GB-0001', 'GB-0002', 'GB-0003', 'GB-0004'])).toEqual([
      { code: 'GB-0001', name: 'Old School' },
      { code: 'GB-0002', name: 'Waiting' },
    ]);
  });

  it("resubmit and discard only touch the user's rejected rows", () => {
    store.insertMany([row('p'), row('r'), row('other', { createdBy: 'u-2' })]);
    setState('r', 'rejected', `, syncError = 'Email taken'`);
    setState('other', 'rejected');
    const later = '2026-10-18T09:00:00.000Z';
    expect(store.resubmit('p', 'u-1', payload('New', 'GB-NEW'), later)).toBe(false);
    expect(store.resubmit('other', 'u-1', payload('New', 'GB-NEW'), later)).toBe(false);
    expect(store.resubmit('r', 'u-1', payload('Fixed', 'GB-FIX'), later)).toBe(true);
    expect(store.getForUser('r', 'u-1')).toMatchObject({
      syncState: 'pending',
      syncError: null,
      updatedAt: later,
      payload: { name: 'Fixed', code: 'GB-FIX' },
    });
    expect(store.discard('p', 'u-1')).toBe(false);
    expect(store.discard('other', 'u-1')).toBe(false);
    setState('r', 'rejected');
    expect(store.discard('r', 'u-1')).toBe(true);
    expect(db.prepare(`SELECT id FROM school_registrations ORDER BY id`).all()).toEqual([{ id: 'other' }, { id: 'p' }]);
  });

  it('knownInstitutionIds finds local institutions in any state', () => {
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt,isActive)
       VALUES ('closed','GB-1','Closed','SCHOOL','GOVERNMENT','county-1','APPROVED',1,?,0)`,
    ).run(NOW);
    expect(store.knownInstitutionIds(['closed', 'missing'])).toEqual(['closed']);
    expect(store.knownInstitutionIds([])).toEqual([]);
  });

  it('context returns the county with its code and only active districts', () => {
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Owensgrove','county-1',1)`).run();
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`).run();
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-3','Closed','county-1',0)`).run();
    expect(store.context()).toEqual({
      county: { id: 'county-1', name: 'Grand Bassa', code: 'GB' },
      districts: [
        { id: 'd-1', name: 'Buchanan' },
        { id: 'd-2', name: 'Owensgrove' },
      ],
    });
    db.prepare(`DELETE FROM counties`).run();
    expect(store.context().county).toBeNull();
  });
});
