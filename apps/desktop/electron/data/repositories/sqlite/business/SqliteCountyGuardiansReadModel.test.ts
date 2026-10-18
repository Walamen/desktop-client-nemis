import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyGuardiansReadModel } from './SqliteCountyGuardiansReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyGuardiansReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyGuardiansReadModel;
  let seq = 0;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (id: string, name: string, districtId: string, opts: { isActive?: number; countyId?: string } = {}) =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'SCHOOL','GOVERNMENT',?,?,'APPROVED',1,?,?)`,
      id, id.toUpperCase(), name, opts.countyId ?? 'county-1', districtId, NOW, opts.isActive ?? 1,
    );
  const student = (id: string, institutionId: string, lastName: string, opts: { first?: string; isActive?: number } = {}) => {
    seq += 1;
    run(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt,photoUrl,nationalId)
       VALUES (?,?,?,?,?,'2014-02-03','FEMALE',?,1,?,NULL,NULL)`,
      id, institutionId, opts.first ?? 'Pupil', lastName, String(seq).padStart(12, '0'), opts.isActive ?? 1, NOW,
    );
  };
  const guardian = (
    id: string,
    lastName: string,
    opts: { first?: string; relationship?: string; phone?: string; email?: string | null; emergency?: number; photoUrl?: string | null; occupation?: string | null } = {},
  ) =>
    run(
      `INSERT INTO guardians (id,firstName,lastName,relationship,phoneNumber,email,address,occupation,isEmergencyContact,version,updatedAt,photoUrl)
       VALUES (?,?,?,?,?,?,NULL,?,?,1,?,?)`,
      id, opts.first ?? 'Mary', lastName, opts.relationship ?? 'Mother', opts.phone ?? '0770000000',
      opts.email ?? null, opts.occupation ?? null, opts.emergency ?? 0, NOW, opts.photoUrl ?? null,
    );
  const link = (studentId: string, guardianId: string, isPrimary = 0) =>
    run(`INSERT INTO student_guardians (id,studentId,guardianId,isPrimary,createdAt) VALUES (?,?,?,?,?)`,
      `sg-${studentId}-${guardianId}`, studentId, guardianId, isPrimary, NOW);

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyGuardiansReadModel(test.context);
    seq = 0;
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Owensgrove','county-1',1)`);
    school('sch-a', 'Alpha School', 'd-1');
    school('sch-a2', 'Alpha Two School', 'd-1');
    school('sch-b', 'Beta School', 'd-2');
    school('sch-closed', 'Closed School', 'd-1', { isActive: 0 });
    school('sch-other', 'Other County School', 'd-9', { countyId: 'county-2' });
  });
  afterEach(() => test.cleanup());

  const query = (extra: Record<string, unknown> = {}) => ({ page: 1, limit: 12, ...extra });
  const ids = (extra: Record<string, unknown> = {}) => readModel.listGuardians(query(extra)).data.map((g) => g.id);

  it('lists guardians by last name, first name, id with their county child count and sorted distinct districts', () => {
    student('s-1', 'sch-a', 'Kollie');
    student('s-2', 'sch-a2', 'Kollie');
    student('s-3', 'sch-b', 'Doe');
    guardian('g-b', 'Doe', { first: 'Zed' });
    guardian('g-a', 'Doe', { first: 'Abe' });
    guardian('g-k', 'Kollie', { photoUrl: 'https://x/g.jpg', email: 'k@x.lr' });
    link('s-3', 'g-b');
    link('s-3', 'g-a');
    link('s-1', 'g-k');
    link('s-2', 'g-k');
    link('s-3', 'g-k');

    const page = readModel.listGuardians(query());
    expect(page.data.map((g) => g.id)).toEqual(['g-a', 'g-b', 'g-k']);
    expect(page.data[2]).toEqual({
      id: 'g-k', firstName: 'Mary', lastName: 'Kollie', relationship: 'Mother', phoneNumber: '0770000000',
      email: 'k@x.lr', photoUrl: 'https://x/g.jpg', studentsCount: 3, districts: ['Buchanan', 'Owensgrove'],
    });
  });

  it('a guardian with two county children appears once and is counted once', () => {
    student('s-1', 'sch-a', 'Kollie');
    student('s-2', 'sch-b', 'Kollie');
    guardian('g-1', 'Kollie');
    link('s-1', 'g-1', 1);
    link('s-2', 'g-1', 1);

    const page = readModel.listGuardians(query());
    expect(page.data.map((g) => g.id)).toEqual(['g-1']);
    expect(page.total).toBe(1);
    expect(page.stats).toEqual({ total: 1, primaryGuardians: 1, childrenCovered: 2 });
  });

  it('leaves out a guardian whose only child is inactive, at an inactive school, or in another county', () => {
    student('s-in', 'sch-a', 'In', { isActive: 0 });
    student('s-closed', 'sch-closed', 'Closed');
    student('s-other', 'sch-other', 'Other');
    student('s-ok', 'sch-b', 'Ok');
    guardian('g-inactive', 'A');
    guardian('g-closed', 'B');
    guardian('g-other', 'C');
    guardian('g-ok', 'D');
    link('s-in', 'g-inactive');
    link('s-closed', 'g-closed');
    link('s-other', 'g-other');
    link('s-ok', 'g-ok');

    expect(ids()).toEqual(['g-ok']);
  });

  it("counts a listed guardian's inactive and closed-school county children, never another county's", () => {
    student('s-ok', 'sch-a', 'Ok');
    student('s-in', 'sch-a', 'In', { isActive: 0 });
    student('s-closed', 'sch-closed', 'Closed');
    student('s-other', 'sch-other', 'Other');
    guardian('g-1', 'Kollie');
    ['s-ok', 's-in', 's-closed', 's-other'].forEach((s) => link(s, 'g-1'));

    expect(readModel.listGuardians(query()).data[0]?.studentsCount).toBe(3);
  });

  it('matches the relationship ignoring case and surrounding spaces; Other is only the word other', () => {
    student('s-1', 'sch-a', 'Kollie');
    guardian('g-upper', 'A', { relationship: ' FATHER ' });
    guardian('g-lower', 'B', { relationship: 'father' });
    guardian('g-step', 'C', { relationship: 'Stepfather' });
    guardian('g-other', 'D', { relationship: 'OTHER' });
    ['g-upper', 'g-lower', 'g-step', 'g-other'].forEach((g) => link('s-1', g));

    expect(ids({ relationship: 'Father' })).toEqual(['g-upper', 'g-lower']);
    expect(ids({ relationship: 'Other' })).toEqual(['g-other']);
  });

  it('searches names, phone and email ignoring case, with % _ and \\ taken literally', () => {
    student('s-1', 'sch-a', 'Kollie');
    guardian('g-name', 'Johnson', { first: 'Ada' });
    guardian('g-phone', 'B', { phone: '+231770555' });
    guardian('g-email', 'C', { email: 'Musu@School.LR' });
    guardian('g-pct', 'D', { first: 'Got50%' });
    guardian('g-under', 'E', { first: 'a_b' });
    guardian('g-x', 'F', { first: 'axb' });
    guardian('g-slash', 'G', { first: 'back\\slash' });
    ['g-name', 'g-phone', 'g-email', 'g-pct', 'g-under', 'g-x', 'g-slash'].forEach((g) => link('s-1', g));

    expect(ids({ search: 'johnSON' })).toEqual(['g-name']);
    expect(ids({ search: 'ada' })).toEqual(['g-name']);
    expect(ids({ search: '770555' })).toEqual(['g-phone']);
    expect(ids({ search: 'school.lr' })).toEqual(['g-email']);
    expect(ids({ search: '50%' })).toEqual(['g-pct']);
    expect(ids({ search: 'a_b' })).toEqual(['g-under']);
    expect(ids({ search: 'k\\s' })).toEqual(['g-slash']);
    expect(ids({ search: '  ada  ' })).toEqual(['g-name']);
  });

  it('the district filter keeps a guardian with a county child in that district', () => {
    student('s-1', 'sch-a', 'Kollie');
    student('s-2', 'sch-b', 'Doe');
    guardian('g-1', 'Kollie');
    guardian('g-2', 'Doe');
    link('s-1', 'g-1');
    link('s-2', 'g-2');

    expect(ids({ districtId: 'd-2' })).toEqual(['g-2']);
  });

  it('pages with a stable order; an empty result has one page', () => {
    student('s-1', 'sch-a', 'Kollie');
    ['g-1', 'g-2', 'g-3'].forEach((g, i) => {
      guardian(g, `Name${i}`);
      link('s-1', g);
    });

    const first = readModel.listGuardians(query({ limit: 2 }));
    expect(first).toMatchObject({ total: 3, page: 1, limit: 2, totalPages: 2 });
    expect(readModel.listGuardians(query({ limit: 2, page: 2 })).data.map((g) => g.id)).toEqual(['g-3']);

    const empty = readModel.listGuardians(query({ search: 'nobody' }));
    expect(empty).toMatchObject({ data: [], total: 0, totalPages: 1 });
  });

  it('stats: total, primary only via an active child at an active school, children covered', () => {
    student('s-ok', 'sch-a', 'Ok');
    student('s-in', 'sch-a', 'In', { isActive: 0 });
    guardian('g-primary', 'A');
    guardian('g-primary-inactive', 'B');
    guardian('g-plain', 'C');
    link('s-ok', 'g-primary', 1);
    link('s-ok', 'g-primary-inactive');
    link('s-in', 'g-primary-inactive', 1);
    link('s-ok', 'g-plain');

    expect(readModel.listGuardians(query({ search: 'nobody' })).stats).toEqual({
      total: 3,
      primaryGuardians: 1,
      childrenCovered: 4,
    });
  });

  it('with no county row synced (older server), guardians at every school are listed', () => {
    student('s-1', 'sch-other', 'Other');
    guardian('g-1', 'Kollie');
    link('s-1', 'g-1');
    run(`DELETE FROM counties`);

    expect(ids()).toEqual(['g-1']);
  });

  describe('getGuardian', () => {
    it('returns the contact fields and the county children in name order', () => {
      student('s-b', 'sch-b', 'Kollie', { first: 'Ben' });
      student('s-a', 'sch-a', 'Kollie', { first: 'Ada', isActive: 0 });
      student('s-other', 'sch-other', 'Aaron');
      guardian('g-1', 'Kollie', { email: 'm@x.lr', emergency: 1, occupation: 'Trader', photoUrl: 'https://x/g.jpg' });
      link('s-b', 'g-1', 1);
      link('s-a', 'g-1');
      link('s-other', 'g-1');

      const detail = readModel.getGuardian('g-1');
      expect(detail).toMatchObject({
        id: 'g-1', firstName: 'Mary', lastName: 'Kollie', relationship: 'Mother', phoneNumber: '0770000000',
        email: 'm@x.lr', address: null, occupation: 'Trader', isEmergencyContact: true, photoUrl: 'https://x/g.jpg',
        studentsCount: 2, districts: ['Buchanan', 'Owensgrove'],
      });
      expect(detail?.children).toEqual([
        {
          id: 's-a', firstName: 'Ada', lastName: 'Kollie', nemisId: '000000000002', photoUrl: null, isActive: false,
          isPrimary: false, institution: { id: 'sch-a', name: 'Alpha School', districtName: 'Buchanan' },
        },
        {
          id: 's-b', firstName: 'Ben', lastName: 'Kollie', nemisId: '000000000001', photoUrl: null, isActive: true,
          isPrimary: true, institution: { id: 'sch-b', name: 'Beta School', districtName: 'Owensgrove' },
        },
      ]);
    });

    it('messageInstitutionId: the primary child wins', () => {
      student('s-a', 'sch-a', 'Able');
      student('s-b', 'sch-b', 'Bravo');
      guardian('g-1', 'Kollie');
      link('s-a', 'g-1');
      link('s-b', 'g-1', 1);
      expect(readModel.getGuardian('g-1')?.messageInstitutionId).toBe('sch-b');
    });

    it('messageInstitutionId: falls back to the first child by name', () => {
      student('s-b', 'sch-b', 'Bravo');
      student('s-a', 'sch-a2', 'Able');
      guardian('g-1', 'Kollie');
      link('s-b', 'g-1');
      link('s-a', 'g-1');
      expect(readModel.getGuardian('g-1')?.messageInstitutionId).toBe('sch-a2');
    });

    it('messageInstitutionId: skips an inactive primary child and a closed school', () => {
      student('s-a', 'sch-a', 'Able', { isActive: 0 });
      student('s-c', 'sch-closed', 'Aaron');
      student('s-b', 'sch-b', 'Bravo');
      guardian('g-1', 'Kollie');
      link('s-a', 'g-1', 1);
      link('s-c', 'g-1', 1);
      link('s-b', 'g-1');
      expect(readModel.getGuardian('g-1')?.messageInstitutionId).toBe('sch-b');
    });

    it('stays openable with every child inactive, with no messageInstitutionId', () => {
      student('s-a', 'sch-a', 'Able', { isActive: 0 });
      guardian('g-1', 'Kollie');
      link('s-a', 'g-1', 1);
      expect(readModel.getGuardian('g-1')).toMatchObject({ studentsCount: 1, messageInstitutionId: null });
    });

    it('is null for an unknown id and for a guardian linked only to another county', () => {
      student('s-other', 'sch-other', 'Other');
      guardian('g-other', 'Kollie');
      link('s-other', 'g-other');
      expect(readModel.getGuardian('nope')).toBeNull();
      expect(readModel.getGuardian('g-other')).toBeNull();
    });
  });
});
