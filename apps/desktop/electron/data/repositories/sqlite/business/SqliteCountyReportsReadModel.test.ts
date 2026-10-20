import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyReportsReadModel } from './SqliteCountyReportsReadModel';

const NOW = '2026-10-20T12:00:00.000Z';
const STAMP = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyReportsReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyReportsReadModel;
  let seq = 0;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (id: string, name: string, districtId: string | null, opts: { isActive?: number; countyId?: string } = {}) =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'SCHOOL','GOVERNMENT',?,?,'APPROVED',1,?,?)`,
      id, `${id.toUpperCase()}-CODE`, name, opts.countyId ?? 'county-1', districtId, STAMP, opts.isActive ?? 1,
    );
  const student = (
    institutionId: string,
    gender: string,
    opts: { gradeLevel?: string | null; isActive?: number; createdAt?: string | null } = {},
  ) => {
    seq += 1;
    run(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,gradeLevel,isActive,version,updatedAt,createdAt)
       VALUES (?,?,'Pupil',?,?,'2014-02-03',?,?,?,1,?,?)`,
      `st-${seq}`, institutionId, `L${seq}`, String(seq).padStart(12, '0'), gender,
      opts.gradeLevel === undefined ? 'GRADE_1' : opts.gradeLevel, opts.isActive ?? 1, STAMP,
      opts.createdAt === undefined ? '2026-01-15T10:00:00.000Z' : opts.createdAt,
    );
  };

  beforeEach(() => {
    seq = 0;
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyReportsReadModel(test.context);
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Owensgrove','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-old','Closed District','county-1',0)`);
    school('sch-b', 'Beta School', 'd-1');
    school('sch-a', 'Alpha School', 'd-1');
    school('sch-o', 'Owens School', 'd-2');
    school('sch-n', 'Nowhere School', null);
    school('sch-c', 'Closed School', 'd-1', { isActive: 0 });
    school('sch-f', 'Far School', 'd-1', { countyId: 'county-2' });

    student('sch-a', 'MALE', { gradeLevel: 'GRADE_2', createdAt: '2026-06-10T10:00:00.000Z' });
    student('sch-a', 'FEMALE', { gradeLevel: 'GRADE_2', createdAt: '2026-08-10T10:00:00.000Z' });
    student('sch-a', 'OTHER', { gradeLevel: null, createdAt: '2026-10-05T10:00:00.000Z' });
    student('sch-a', 'MALE', { isActive: 0 });
    student('sch-b', 'FEMALE', { gradeLevel: 'KG', createdAt: null });
    student('sch-o', 'MALE', { gradeLevel: 'GRADE_2' });
    student('sch-o', 'MALE', { gradeLevel: 'GRADE_2' });
    student('sch-n', 'FEMALE', { gradeLevel: 'GRADE_1' });
    student('sch-c', 'MALE');
    student('sch-f', 'FEMALE');
  });
  afterEach(() => test.cleanup());

  describe('getEnrollmentReport, county-wide', () => {
    it('summary counts male, female and OTHER only in totals', () => {
      expect(readModel.getEnrollmentReport({}, NOW).summary).toEqual({
        totalSchools: 4,
        totalStudents: 7,
        totalMale: 3,
        totalFemale: 3,
        genderRatio: '1.00',
      });
    });

    it('byGradeLevel uses the student grade, UNKNOWN when null', () => {
      const byGrade = Object.fromEntries(
        readModel.getEnrollmentReport({}, NOW).byGradeLevel.map((g) => [g.gradeLevel, g]),
      );
      expect(byGrade).toEqual({
        GRADE_2: { gradeLevel: 'GRADE_2', male: 3, female: 1, total: 4 },
        UNKNOWN: { gradeLevel: 'UNKNOWN', male: 0, female: 0, total: 1 },
        KG: { gradeLevel: 'KG', male: 0, female: 1, total: 1 },
        GRADE_1: { gradeLevel: 'GRADE_1', male: 0, female: 1, total: 1 },
      });
    });

    it('county-wide lists byDistrict with Unknown District for a school without one, schools ordered with it last', () => {
      const report = readModel.getEnrollmentReport({}, NOW);
      expect(report.bySchool.map((s) => s.schoolId)).toEqual(['sch-a', 'sch-b', 'sch-o', 'sch-n']);
      expect(report.bySchool[0]).toEqual({
        schoolId: 'sch-a',
        schoolName: 'Alpha School',
        schoolCode: 'SCH-A-CODE',
        totalStudents: 3,
        male: 1,
        female: 1,
        districtId: 'd-1',
        districtName: 'Buchanan',
      });
      expect(report.byDistrict).toEqual([
        { districtId: 'd-1', districtName: 'Buchanan', totalSchools: 2, totalStudents: 4, totalMale: 1, totalFemale: 2, genderRatio: '0.50' },
        { districtId: 'd-2', districtName: 'Owensgrove', totalSchools: 1, totalStudents: 2, totalMale: 2, totalFemale: 0, genderRatio: 'N/A' },
        { districtId: 'unknown', districtName: 'Unknown District', totalSchools: 1, totalStudents: 1, totalMale: 0, totalFemale: 1, genderRatio: '0.00' },
      ]);
      expect(report.scopeName).toBeNull();
    });

    it('inactive and other-county schools and inactive students are excluded', () => {
      const report = readModel.getEnrollmentReport({}, NOW);
      expect(report.bySchool.map((s) => s.schoolId)).not.toContain('sch-c');
      expect(report.bySchool.map((s) => s.schoolId)).not.toContain('sch-f');
      expect(report.bySchool.find((s) => s.schoolId === 'sch-a')!.totalStudents).toBe(3);
    });

    it('trend is six months oldest first, counting students created by each month end; null createdAt never counts', () => {
      expect(readModel.getEnrollmentReport({}, NOW).trendData).toEqual([
        { month: 'May 2026', count: 3 },
        { month: 'Jun 2026', count: 4 },
        { month: 'Jul 2026', count: 4 },
        { month: 'Aug 2026', count: 5 },
        { month: 'Sep 2026', count: 5 },
        { month: 'Oct 2026', count: 6 },
      ]);
    });
  });

  describe('getEnrollmentReport, one district', () => {
    it('a district report has no byDistrict and names the district', () => {
      const report = readModel.getEnrollmentReport({ districtId: 'd-1' }, NOW);
      expect(report.byDistrict).toBeUndefined();
      expect(report.scopeName).toBe('Buchanan');
      expect(report.bySchool.map((s) => s.schoolId)).toEqual(['sch-a', 'sch-b']);
      expect(report.summary).toMatchObject({ totalSchools: 2, totalStudents: 4, totalMale: 1, totalFemale: 2 });
    });

    it('the school filter narrows schools, students and the trend', () => {
      const report = readModel.getEnrollmentReport({ districtId: 'd-1', schoolId: 'sch-a' }, NOW);
      expect(report.bySchool.map((s) => s.schoolId)).toEqual(['sch-a']);
      expect(report.summary.totalStudents).toBe(3);
      expect(report.trendData.map((t) => t.count)).toEqual([0, 1, 1, 2, 2, 3]);
    });
  });

  describe('options and schools', () => {
    it('options list active own-county districts by name with the county code', () => {
      expect(readModel.getOptions()).toEqual({
        countyCode: 'GB',
        districts: [
          { id: 'd-1', name: 'Buchanan' },
          { id: 'd-2', name: 'Owensgrove' },
        ],
      });
    });

    it("schools list a district's active own-county schools by name", () => {
      expect(readModel.listSchools('d-1')).toEqual([
        { id: 'sch-a', name: 'Alpha School' },
        { id: 'sch-b', name: 'Beta School' },
      ]);
    });
  });
});
