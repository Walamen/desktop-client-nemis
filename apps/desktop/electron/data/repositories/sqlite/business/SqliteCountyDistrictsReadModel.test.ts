import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyDistrictsReadModel } from './SqliteCountyDistrictsReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyDistrictsReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyDistrictsReadModel;
  let seq = 0;

  const county = () => db.prepare(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`).run();
  const district = (id: string, name: string, opts: { isActive?: number; countyId?: string; code?: string } = {}) =>
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive,code) VALUES (?,?,?,?,?)`).run(id, name, opts.countyId ?? 'county-1', opts.isActive ?? 1, opts.code ?? null);
  const school = (id: string, districtId: string, opts: { isActive?: number; type?: string; profile?: string | null; contactPhone?: string | null } = {}) =>
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive,profile,contactPhone)
       VALUES (?,?,?,?, 'PUBLIC','county-1',?,'APPROVED',1,?,?,?,?)`,
    ).run(id, id.toUpperCase(), `School ${id}`, opts.type ?? 'SCHOOL', districtId, NOW, opts.isActive ?? 1, opts.profile ?? null, opts.contactPhone ?? null);
  const student = (id: string, institutionId: string, isActive = 1) => {
    seq += 1;
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES (?,?,'F','L',?,'2015-01-01','MALE',?,1,?)`,
    ).run(id, institutionId, String(seq).padStart(12, '0'), isActive, NOW);
  };
  const staff = (id: string, institutionId: string, position: string, isActive = 1) =>
    db.prepare(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
       VALUES (?,?,'T','C','1990-01-01','FEMALE','0770000000',?,?,'FULL_TIME','2020-01-01',?,?,?)`,
    ).run(id, institutionId, id, position, isActive, NOW, NOW);
  const user = (id: string, first: string, opts: { createdAt?: string; isActive?: number; photoUrl?: string | null } = {}) =>
    db.prepare(
      `INSERT INTO users (id,firstName,lastName,email,isActive,version,updatedAt,phoneNumber,lastLoginAt,photoUrl,createdAt)
       VALUES (?,?, 'Kollie', ?, ?, 1, ?, '0770000001', NULL, ?, ?)`,
    ).run(id, first, `${id}@moe.gov.lr`, opts.isActive ?? 1, NOW, opts.photoUrl ?? null, opts.createdAt ?? NOW);
  const org = (id: string, userId: string, opts: { districtId?: string | null; countyId?: string | null; isActive?: number; role?: string } = {}) =>
    db.prepare(`INSERT INTO user_organizations (id,userId,role,institutionId,countyId,districtId,isActive) VALUES (?,?,?,NULL,?,?,?)`).run(
      id, userId, opts.role ?? 'DEO', opts.countyId === undefined ? 'county-1' : opts.countyId, opts.districtId ?? null, opts.isActive ?? 1,
    );

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyDistrictsReadModel(test.context);
    seq = 0;
  });
  afterEach(() => test.cleanup());

  it('lists only active, own-county districts by name with school and DEO counts and the first DEO', () => {
    county();
    district('d-2', 'Owensgrove', { code: 'D2' });
    district('d-1', 'Buchanan', { code: 'D1' });
    district('d-off', 'Closed', { isActive: 0 });
    district('d-x', 'Elsewhere', { countyId: 'county-2' });
    school('a', 'd-1');
    school('b', 'd-1', { isActive: 0 });
    user('deo-b', 'Bendu', { photoUrl: 'https://img.example/b.png' });
    user('deo-a', 'Abu');
    org('org-2', 'deo-b', { districtId: 'd-1' });
    org('org-1', 'deo-a', { districtId: 'd-1', isActive: 0 });
    expect(readModel.listActiveDistricts()).toEqual([
      {
        id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true, activeSchoolCount: 1, activeDeoCount: 1,
        firstDeo: { userId: 'deo-b', firstName: 'Bendu', lastName: 'Kollie', email: 'deo-b@moe.gov.lr', photoUrl: 'https://img.example/b.png' },
      },
      { id: 'd-2', name: 'Owensgrove', code: 'D2', isActive: true, activeSchoolCount: 0, activeDeoCount: 0, firstDeo: null },
    ]);
  });

  it("gets an own-county district and returns null for another county's or an unknown id", () => {
    county();
    district('d-1', 'Buchanan', { code: 'D1' });
    district('d-x', 'Elsewhere', { countyId: 'county-2' });
    expect(readModel.getDistrict('d-1')).toEqual({ id: 'd-1', name: 'Buchanan', code: 'D1', isActive: true });
    expect(readModel.getDistrict('d-x')).toBeNull();
    expect(readModel.getDistrict('nope')).toBeNull();
  });

  it("lists the district's active institutions by name with parsed metadata minus levels", () => {
    district('d-1', 'Buchanan');
    school('zeta', 'd-1', { profile: JSON.stringify({ principalName: 'Mr. Doe', statistics: { studentCount: 40 }, levels: ['PRIMARY'] }), contactPhone: '0771' });
    school('alpha', 'd-1', { type: 'TVET' });
    school('closed', 'd-1', { isActive: 0 });
    const rows = readModel.listDistrictInstitutions('d-1');
    expect(rows.map((r) => r.id)).toEqual(['alpha', 'zeta']);
    expect(rows[1]).toMatchObject({
      type: 'SCHOOL', contactPhone: '0771', isActive: true,
      metadata: { principalName: 'Mr. Doe', statistics: { studentCount: 40 } },
    });
    expect(rows[1]!.metadata).not.toHaveProperty('levels');
    expect(rows[0]!.metadata).toBeNull();
  });

  it('counts active schools, active students in them, teaching staff only, and active DEOs', () => {
    district('d-1', 'Buchanan');
    school('a', 'd-1');
    school('closed', 'd-1', { isActive: 0 });
    student('s1', 'a');
    student('s2', 'a', 0);
    student('s3', 'closed');
    staff('t1', 'a', 'TEACHER');
    staff('t2', 'a', 'ASSISTANT_TEACHER');
    staff('t3', 'a', 'PRINCIPAL');
    staff('t4', 'a', 'TEACHER', 0);
    user('deo-1', 'Musu');
    org('org-1', 'deo-1', { districtId: 'd-1' });
    expect(readModel.getDistrictCounts('d-1')).toEqual({ schools: 1, students: 1, teachers: 2, deos: 1 });
  });

  it("lists the district's active officers with full names", () => {
    district('d-1', 'Buchanan');
    user('deo-1', 'Musu');
    user('deo-2', 'Old');
    org('org-1', 'deo-1', { districtId: 'd-1' });
    org('org-0', 'deo-2', { districtId: 'd-1', isActive: 0 });
    expect(readModel.listDistrictOfficers('d-1')).toEqual([
      { userId: 'deo-1', name: 'Musu Kollie', email: 'deo-1@moe.gov.lr', phoneNumber: '0770000001', isActive: true, lastLoginAt: null, photoUrl: null },
    ]);
  });

  it('lists county DEOs and the unassigned pool newest first, each with its active district', () => {
    county();
    district('d-1', 'Buchanan');
    user('deo-old', 'Old', { createdAt: '2025-01-01T00:00:00.000Z' });
    user('deo-pool', 'Pool', { createdAt: '2026-05-01T00:00:00.000Z', isActive: 0 });
    user('deo-other', 'Other', { createdAt: '2026-06-01T00:00:00.000Z' });
    user('admin', 'Admin');
    org('org-1', 'deo-old', { districtId: 'd-1' });
    org('org-2', 'deo-pool', { countyId: null, districtId: null });
    org('org-3', 'deo-other', { countyId: 'county-2', districtId: 'd-z' });
    org('org-4', 'admin', { role: 'INSTITUTION_ADMIN' });
    expect(readModel.listCountyDeoUsers().map((u) => [u.id, u.districtId, u.isActive])).toEqual([
      ['deo-pool', null, false],
      ['deo-old', 'd-1', true],
    ]);
  });
});
