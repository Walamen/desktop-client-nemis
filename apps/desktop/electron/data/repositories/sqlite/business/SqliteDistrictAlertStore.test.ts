import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteDistrictAlertStore } from './SqliteDistrictAlertStore';

const STAMP = '2026-01-01T00:00:00.000Z';
const NOW = '2026-11-16T12:00:00.000Z';

describe('SqliteDistrictAlertStore', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let store: SqliteDistrictAlertStore;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (id: string, districtId: string) =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'PRIMARY','PUBLIC','county-1',?,'APPROVED',1,?,1)`,
      id, id, `School ${id}`, districtId, STAMP,
    );
  const alert = (id: string, opts: { countyId?: string | null; districtId?: string | null; institutionId?: string | null; isResolved?: number }) =>
    run(
      `INSERT INTO alerts (id,countyId,districtId,institutionId,type,severity,title,description,isResolved,resolvedAt,resolvedBy,metadata,createdAt,updatedAt)
       VALUES (?,?,?,?,'DATA','HIGH','A','D',?,NULL,NULL,NULL,?,?)`,
      id, opts.countyId ?? null, opts.districtId ?? null, opts.institutionId ?? null, opts.isResolved ?? 0, STAMP, STAMP,
    );
  const row = (id: string) =>
    db.prepare(`SELECT isResolved, resolvedAt, resolvedBy, updatedAt FROM alerts WHERE id = ?`).get(id);
  const queued = () =>
    db
      .prepare(`SELECT entityType, entityId, operationType FROM sync_queue WHERE entityType = 'alerts' AND operationType = 'update'`)
      .all();

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    store = new SqliteDistrictAlertStore(test.context);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Compound 3','county-1',1)`);
    school('s-1', 'd-1');
    school('s-9', 'd-2');
    alert('a-district', { districtId: 'd-1' });
    alert('a-school', { institutionId: 's-1' });
    alert('a-county', { countyId: 'county-1' });
    alert('a-other-district', { districtId: 'd-2' });
    alert('a-other-school', { institutionId: 's-9' });
    alert('a-done', { districtId: 'd-1', isResolved: 1 });
    // Seeding queued inserts; only what resolve() queues matters below.
    run(`DELETE FROM sync_queue`);
  });
  afterEach(() => test.cleanup());

  it('resolves an alert tagged with the district and queues it for sync', () => {
    expect(store.resolve('d-1', 'a-district', 'deo-1', NOW)).toBe(true);
    expect(row('a-district')).toEqual({ isResolved: 1, resolvedAt: NOW, resolvedBy: 'deo-1', updatedAt: NOW });
    expect(queued()).toEqual([{ entityType: 'alerts', entityId: 'a-district', operationType: 'update' }]);
  });

  it('resolves an alert raised against a school of the district', () => {
    expect(store.resolve('d-1', 'a-school', 'deo-1', NOW)).toBe(true);
    expect(row('a-school')).toMatchObject({ isResolved: 1, resolvedBy: 'deo-1' });
  });

  it('does nothing the second time', () => {
    store.resolve('d-1', 'a-district', 'deo-1', NOW);
    expect(store.resolve('d-1', 'a-district', 'deo-2', '2026-11-17T00:00:00.000Z')).toBe(false);
    expect(row('a-district')).toMatchObject({ resolvedAt: NOW, resolvedBy: 'deo-1' });
    expect(queued()).toHaveLength(1);
  });

  it.each(['a-county', 'a-other-district', 'a-other-school', 'a-missing'])(
    'leaves %s alone: it is not this district’s',
    (alertId) => {
      expect(store.resolve('d-1', alertId, 'deo-1', NOW)).toBe(false);
      if (alertId !== 'a-missing') expect(row(alertId)).toMatchObject({ isResolved: 0, resolvedBy: null });
      expect(queued()).toEqual([]);
    },
  );

  it("leaves a school's own staff request for the school admin to answer", () => {
    alert('a-request', { institutionId: 's-1' });
    run(`UPDATE alerts SET metadata = ? WHERE id = 'a-request'`, JSON.stringify({ gradeId: 'g-1', staffId: 'stf-1' }));
    run(`DELETE FROM sync_queue`);
    expect(store.resolve('d-1', 'a-request', 'deo-1', NOW)).toBe(false);
    expect(row('a-request')).toMatchObject({ isResolved: 0 });
    expect(queued()).toEqual([]);
  });

  it('leaves an already resolved alert as it was', () => {
    expect(store.resolve('d-1', 'a-done', 'deo-1', NOW)).toBe(false);
    expect(row('a-done')).toMatchObject({ resolvedAt: null, resolvedBy: null, updatedAt: STAMP });
    expect(queued()).toEqual([]);
  });
});
