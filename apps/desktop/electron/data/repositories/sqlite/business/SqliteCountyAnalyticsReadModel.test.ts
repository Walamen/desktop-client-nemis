import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyAnalyticsReadModel } from './SqliteCountyAnalyticsReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyAnalyticsReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyAnalyticsReadModel;
  let nemisSeq = 0;

  function district(id: string, name: string, isActive = 1) {
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive) VALUES (?,?,'county-1',?)`).run(id, name, isActive);
  }
  function school(id: string, districtId: string | null, isActive = 1) {
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'PRIMARY','PUBLIC','county-1',?,'APPROVED',1,?,?)`,
    ).run(id, id, `School ${id}`, districtId, NOW, isActive);
  }
  function student(
    id: string,
    institutionId: string,
    opts: { gender?: string; gradeLevel?: string | null; isActive?: number; createdAt?: string | null } = {},
  ) {
    nemisSeq += 1;
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,gradeLevel,isActive,version,updatedAt,createdAt)
       VALUES (?,?,'First','Last',?,'2015-01-01',?,?,?,1,?,?)`,
    ).run(
      id,
      institutionId,
      String(nemisSeq).padStart(12, '0'),
      opts.gender ?? 'MALE',
      opts.gradeLevel ?? null,
      opts.isActive ?? 1,
      NOW,
      opts.createdAt ?? null,
    );
  }
  function teacher(id: string, institutionId: string, isActive = 1) {
    db.prepare(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
       VALUES (?,?,'Tee','Cher','1990-01-01','FEMALE','0770000000',?,'TEACHER','FULL_TIME','2020-01-01',?,?,?)`,
    ).run(id, institutionId, id, isActive, NOW, NOW);
  }

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyAnalyticsReadModel(test.context);
    nemisSeq = 0;
  });
  afterEach(() => test.cleanup());

  it('reads nothing from an empty device', () => {
    expect(readModel.getCounty()).toBeNull();
    expect(readModel.listActiveDistricts()).toEqual([]);
    expect(readModel.countActiveSchools()).toBe(0);
    expect(readModel.countActiveStudents()).toBe(0);
    expect(readModel.countActiveTeachers()).toBe(0);
    expect(readModel.countActiveStudentsByGender()).toEqual([]);
    expect(readModel.listActiveSchoolsForCoverage()).toEqual([]);
  });

  it('returns the synced county', () => {
    db.prepare(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`).run();
    expect(readModel.getCounty()).toEqual({ id: 'county-1', name: 'Grand Bassa' });
  });

  it('lists only active districts, by name, with their active-school counts', () => {
    district('d-2', 'Owensgrove');
    district('d-1', 'Buchanan');
    district('d-3', 'Old District', 0);
    school('a', 'd-1');
    school('b', 'd-1');
    school('c', 'd-1', 0);
    school('d', 'd-3');
    expect(readModel.listActiveDistricts()).toEqual([
      { id: 'd-1', name: 'Buchanan', activeSchoolCount: 2 },
      { id: 'd-2', name: 'Owensgrove', activeSchoolCount: 0 },
    ]);
  });

  it("leaves out another county's district that a county school still points at", () => {
    db.prepare(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`).run();
    district('d-1', 'Buchanan');
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-x','Elsewhere','county-2',1)`).run();
    school('a', 'd-1');
    school('drifted', 'd-x');
    expect(readModel.listActiveDistricts()).toEqual([
      { id: 'd-1', name: 'Buchanan', activeSchoolCount: 1 },
    ]);
  });

  it('lists every active district when no county row has synced (older server)', () => {
    district('d-1', 'Buchanan');
    db.prepare(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-x','Elsewhere','county-2',1)`).run();
    expect(readModel.listActiveDistricts().map((d) => d.id)).toEqual(['d-1', 'd-x']);
  });

  it('counts only active students and teachers in active schools', () => {
    district('d-1', 'Buchanan');
    school('open', 'd-1');
    school('closed', 'd-1', 0);
    student('s1', 'open');
    student('s2', 'open', { isActive: 0 });
    student('s3', 'closed');
    teacher('t1', 'open');
    teacher('t2', 'open', 0);
    teacher('t3', 'closed');
    expect(readModel.countActiveSchools()).toBe(1);
    expect(readModel.countActiveStudents()).toBe(1);
    expect(readModel.countActiveTeachers()).toBe(1);
  });

  it('groups active students by gender, grade level and district name', () => {
    district('d-1', 'Buchanan');
    district('d-2', 'Old District', 0);
    school('a', 'd-1');
    school('b', 'd-2'); // inactive district, active school: still counted under its name
    school('c', null); // no district: counted in totals, not in by-district
    student('s1', 'a', { gender: 'MALE', gradeLevel: 'GRADE_1' });
    student('s2', 'a', { gender: 'FEMALE', gradeLevel: 'GRADE_1' });
    student('s3', 'b', { gender: 'FEMALE', gradeLevel: 'GRADE_10' });
    student('s4', 'c', { gender: 'FEMALE', gradeLevel: null });
    expect(readModel.countActiveStudents()).toBe(4);
    expect(readModel.countActiveStudentsByGender()).toEqual(
      expect.arrayContaining([
        { gender: 'MALE', count: 1 },
        { gender: 'FEMALE', count: 3 },
      ]),
    );
    expect(readModel.countActiveStudentsByGradeLevel()).toEqual(
      expect.arrayContaining([
        { gradeLevel: 'GRADE_1', count: 2 },
        { gradeLevel: 'GRADE_10', count: 1 },
      ]),
    );
    expect(readModel.countActiveStudentsByGradeLevel()).toHaveLength(2);
    expect(readModel.countActiveStudentsByDistrict()).toEqual([
      { districtName: 'Buchanan', count: 2 },
      { districtName: 'Old District', count: 1 },
    ]);
  });

  it('lists active students created on or after a date, skipping NULL createdAt', () => {
    school('a', null);
    student('old', 'a', { createdAt: '2025-06-15T12:00:00.000Z' });
    student('new', 'a', { createdAt: '2026-03-15T12:00:00.000Z', gender: 'FEMALE' });
    student('unknown', 'a', { createdAt: null });
    student('gone', 'a', { createdAt: '2026-04-01T12:00:00.000Z', isActive: 0 });
    expect(readModel.listActiveStudentCreations('2025-11-01T00:00:00.000Z')).toEqual([
      { createdAt: '2026-03-15T12:00:00.000Z', gender: 'FEMALE' },
    ]);
  });

  it('lists active schools for coverage, counting all of their students', () => {
    district('d-1', 'Buchanan');
    school('a', 'd-1');
    school('b', 'd-1');
    school('closed', 'd-1', 0);
    student('s1', 'a', { isActive: 0 }); // inactive still counts, as on the server
    expect(readModel.listActiveSchoolsForCoverage()).toEqual([
      { districtName: 'Buchanan', totalStudentCount: 1 },
      { districtName: 'Buchanan', totalStudentCount: 0 },
    ]);
  });
});
