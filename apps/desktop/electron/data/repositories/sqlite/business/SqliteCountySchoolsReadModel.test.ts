import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountySchoolsReadModel } from './SqliteCountySchoolsReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountySchoolsReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountySchoolsReadModel;
  let seq = 0;

  const county = () => db.prepare(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`).run();
  const district = (id: string, name: string) =>
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive) VALUES (?,?,'county-1',1)`).run(id, name);
  const school = (
    id: string,
    name: string,
    opts: {
      districtId?: string | null;
      isActive?: number;
      countyId?: string;
      profile?: string | null;
      details?: string | null;
      approvalStatus?: string;
    } = {},
  ) =>
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive,street,profile,details)
       VALUES (?,?,?,'SCHOOL','GOVERNMENT',?,?,?,1,?,?,'1 Road',?,?)`,
    ).run(
      id,
      id.toUpperCase(),
      name,
      opts.countyId ?? 'county-1',
      opts.districtId ?? null,
      opts.approvalStatus ?? 'APPROVED',
      NOW,
      opts.isActive ?? 1,
      opts.profile ?? null,
      opts.details ?? null,
    );
  const student = (id: string, institutionId: string, isActive = 1) => {
    seq += 1;
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES (?,?,'F','L',?,'2015-01-01','MALE',?,1,?)`,
    ).run(id, institutionId, String(seq).padStart(12, '0'), isActive, NOW);
  };
  const staff = (id: string, institutionId: string, isActive = 1) =>
    db.prepare(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
       VALUES (?,?,'T','C','1990-01-01','FEMALE','0770000000',?,'TEACHER','FULL_TIME','2020-01-01',?,?,?)`,
    ).run(id, institutionId, id, isActive, NOW, NOW);
  const admin = (id: string, institutionId: string, first: string, isActive = 1) =>
    db.prepare(
      `INSERT INTO institution_admin (id,institutionId,firstName,lastName,position,photoUrl,email,phoneNumber,isActive)
       VALUES (?,?,?,'Doe','PRINCIPAL',NULL,?,NULL,?)`,
    ).run(id, institutionId, first, `${first.toLowerCase()}@school.lr`, isActive);

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountySchoolsReadModel(test.context);
    seq = 0;
  });
  afterEach(() => test.cleanup());

  it('lists active own-county schools by name with district, levels, all-student count and photo', () => {
    county();
    district('d-1', 'Buchanan');
    school('b', 'Beta', {
      districtId: 'd-1',
      profile: JSON.stringify({ levels: ['PRIMARY', 'SECONDARY'] }),
      details: JSON.stringify({ photoUrl: 'https://res.cloudinary.com/x/b.jpg' }),
    });
    school('a', 'Alpha');
    school('off', 'Closed', { isActive: 0 });
    school('x', 'Elsewhere', { countyId: 'county-2' });
    student('s1', 'b');
    student('s2', 'b', 0);
    expect(readModel.listActiveSchools()).toEqual([
      { id: 'a', name: 'Alpha', code: 'A', type: 'SCHOOL', isActive: true, districtName: null, levels: [], studentCount: 0, photoUrl: null },
      {
        id: 'b', name: 'Beta', code: 'B', type: 'SCHOOL', isActive: true, districtName: 'Buchanan',
        levels: ['PRIMARY', 'SECONDARY'], studentCount: 2, photoUrl: 'https://res.cloudinary.com/x/b.jpg',
      },
    ]);
  });

  it('gets any own-county school with counts, metadata, details and the first active principal', () => {
    county();
    district('d-1', 'Buchanan');
    school('p', 'Pending', {
      districtId: 'd-1',
      isActive: 0,
      approvalStatus: 'PENDING',
      profile: JSON.stringify({ statistics: { maxCapacity: 300 }, levels: ['PRIMARY'] }),
      details: JSON.stringify({ establishedYear: 1998, hasLibrary: true }),
    });
    student('s1', 'p');
    student('s2', 'p', 0);
    staff('t1', 'p');
    staff('t2', 'p', 0);
    admin('adm-2', 'p', 'Second');
    admin('adm-1', 'p', 'First');
    admin('adm-0', 'p', 'Gone', 0);
    expect(readModel.getSchool('p')).toMatchObject({
      id: 'p', name: 'Pending', approvalStatus: 'PENDING', isActive: false, ownership: 'GOVERNMENT', street: '1 Road',
      metadata: { statistics: { maxCapacity: 300 } },
      levels: ['PRIMARY'],
      details: { establishedYear: 1998, hasLibrary: true },
      districtName: 'Buchanan', countyName: 'Grand Bassa', studentCount: 2, staffCount: 2,
      principal: { firstName: 'First', lastName: 'Doe', email: 'first@school.lr', photoUrl: null },
    });
    expect(readModel.getSchool('p')!.metadata).not.toHaveProperty('levels');
  });

  it("returns null for another county's or an unknown school", () => {
    county();
    school('x', 'Elsewhere', { countyId: 'county-2' });
    expect(readModel.getSchool('x')).toBeNull();
    expect(readModel.getSchool('nope')).toBeNull();
  });

  it('treats corrupt JSON as missing', () => {
    school('c', 'Corrupt', { profile: '{not json', details: 'nope' });
    expect(readModel.listActiveSchools()[0]).toMatchObject({ levels: [], photoUrl: null });
    expect(readModel.getSchool('c')).toMatchObject({ metadata: null, levels: [], details: null });
  });
});
