import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyReportsReadModel } from './SqliteCountyReportsReadModel';

const NOW = '2026-10-20T12:00:00.000Z';
const STAMP = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyReportsReadModel — attendance, academic, staff', () => {
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
  const student = (id: string, institutionId: string, isActive = 1) =>
    run(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,gradeLevel,isActive,version,updatedAt)
       VALUES (?,?,'Pupil',?,?,'2014-02-03','FEMALE','GRADE_3',?,1,?)`,
      id, institutionId, id, String(++seq).padStart(12, '0'), isActive, STAMP,
    );
  const year = (id: string, institutionId: string, isCurrent: number) =>
    run(
      `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt) VALUES (?,?,?,?,?,?,1,?)`,
      id, institutionId, id, '2025-09-01', '2026-07-01', isCurrent, STAMP,
    );
  const klass = (id: string, institutionId: string, yearId: string) =>
    run(
      `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt) VALUES (?,?,?,?,'GRADE_3',1,1,?)`,
      id, institutionId, yearId, id, STAMP,
    );
  const subject = (id: string, institutionId: string, name: string) =>
    run(`INSERT INTO subjects (id,institutionId,name,code,isActive,version,updatedAt) VALUES (?,?,?,?,1,1,?)`,
      id, institutionId, name, id.toUpperCase(), STAMP);
  const period = (id: string, institutionId: string, yearId: string) =>
    run(
      `INSERT INTO grading_periods (id,institutionId,academicYearId,termId,name,code,periodType,sequence,maxMarks,passingMarks,
                                    weight,startDate,endDate,isActive,createdAt,updatedAt)
       VALUES (?,?,?,'term-1',?,?,'PERIOD',1,100,50,NULL,'2025-09-01','2025-11-01',1,?,?)`,
      id, institutionId, yearId, id, id, STAMP, STAMP,
    );
  const attendance = (studentId: string, classId: string, date: string, status: string) =>
    run(
      `INSERT INTO attendance (id,studentId,classId,subjectId,date,status,recordedBy,version,updatedAt)
       VALUES (?,?,?,NULL,?,?,NULL,1,?)`,
      `att-${++seq}`, studentId, classId, date, status, STAMP,
    );
  const grade = (
    id: string,
    studentId: string,
    subjectId: string,
    marks: number,
    opts: { periodId?: string | null; assessmentId?: string; max?: number; published?: number } = {},
  ) =>
    run(
      `INSERT INTO grades (id,studentId,subjectId,assessmentId,marksObtained,gradingPeriodId,isPublished,maxMarks,status,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id, studentId, subjectId, opts.assessmentId ?? null, marks, opts.periodId === undefined ? 'gp-a' : opts.periodId,
      opts.published ?? 1, opts.max ?? 100, (opts.published ?? 1) ? 'PUBLISHED' : 'DRAFT', STAMP, STAMP,
    );
  const staff = (id: string, institutionId: string, position: string, qualifications: unknown, isActive = 1) =>
    run(
      `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,nationalId,phoneNumber,email,address,employeeNumber,
                          position,employmentType,dateOfJoining,qualifications,isActive,photoUrl,createdAt,updatedAt)
       VALUES (?,?,'Tee',?,'1990-04-05','FEMALE',?,'0770',?,'1 Road',?,?,'FULL_TIME','2015-09-01',?,?,NULL,?,?)`,
      id, institutionId, id, `NAT-${id}`, `${id}@x.lr`, `E-${id}`, position,
      qualifications === null ? null : JSON.stringify(qualifications), isActive, STAMP, STAMP,
    );

  beforeEach(() => {
    seq = 0;
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyReportsReadModel(test.context);
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Owensgrove','county-1',1)`);
    school('sch-a', 'Alpha School', 'd-1');
    school('sch-b', 'Beta School', 'd-2');
    school('sch-c', 'Closed School', 'd-1', { isActive: 0 });
    school('sch-f', 'Far School', 'd-1', { countyId: 'county-2' });
    year('y-a', 'sch-a', 1);
    year('y-a-old', 'sch-a', 0);
    year('y-b', 'sch-b', 1);
    year('y-c', 'sch-c', 1);
    year('y-f', 'sch-f', 1);
    klass('c-a', 'sch-a', 'y-a');
    klass('c-b', 'sch-b', 'y-b');
    klass('c-c', 'sch-c', 'y-c');
    klass('c-f', 'sch-f', 'y-f');
    student('s-1', 'sch-a');
    student('s-2', 'sch-a');
    student('s-gone', 'sch-a', 0);
    student('s-3', 'sch-b');
    student('s-c', 'sch-c');
    student('s-f', 'sch-f');
  });
  afterEach(() => test.cleanup());

  describe('getAttendanceReport', () => {
    beforeEach(() => {
      attendance('s-1', 'c-a', '2026-10-19', 'PRESENT');
      attendance('s-2', 'c-a', '2026-10-19T00:00:00.000Z', 'LATE');
      attendance('s-1', 'c-a', '2026-10-18', 'ABSENT');
      attendance('s-2', 'c-a', '2026-10-18', 'EXCUSED');
      attendance('s-1', 'c-a', '2026-10-01', 'PRESENT');
      attendance('s-1', 'c-a', '2026-09-01', 'PRESENT');
      attendance('s-1', 'c-a', '2026-06-01', 'PRESENT');
      attendance('s-3', 'c-b', '2026-10-17', 'PRESENT');
      attendance('s-c', 'c-c', '2026-10-19', 'PRESENT');
      attendance('s-f', 'c-f', '2026-10-19', 'PRESENT');
    });
    const report = (extra: Record<string, unknown> = {}) =>
      readModel.getAttendanceReport({ period: 'WEEKLY', ...extra } as never, NOW);

    it('rates count late as attended', () => {
      const r = report();
      expect(r.summary).toEqual({
        totalSchools: 2, totalRecords: 6, presentCount: 3, absentCount: 1, lateCount: 1, overallAttendanceRate: 67,
      });
      expect(r.bySchool).toEqual([
        {
          schoolId: 'sch-a', schoolName: 'Alpha School', schoolCode: 'SCH-A-CODE', totalStudents: 2, recordsCount: 5,
          present: 2, absent: 1, late: 1, attendanceRate: 60, districtId: 'd-1', districtName: 'Buchanan',
        },
        {
          schoolId: 'sch-b', schoolName: 'Beta School', schoolCode: 'SCH-B-CODE', totalStudents: 1, recordsCount: 1,
          present: 1, absent: 0, late: 0, attendanceRate: 100, districtId: 'd-2', districtName: 'Owensgrove',
        },
      ]);
    });

    it('the weekly window keeps 28 days back and drops older records; daily keeps 7; monthly keeps 3 months', () => {
      expect(report().summary.totalRecords).toBe(6);
      expect(report({ period: 'DAILY' }).summary.totalRecords).toBe(5);
      expect(report({ period: 'MONTHLY' }).summary.totalRecords).toBe(7);
      expect(report().period.type).toBe('WEEKLY');
      expect(report({ period: 'DAILY' }).period).toMatchObject({ type: 'DAILY', end: NOW });
    });

    it('dates stored as YYYY-MM-DD and ISO both count', () => {
      const trend = report().trendData;
      expect(trend.find((t) => t.date === '2026-10-19')).toEqual({ date: '2026-10-19', rate: 100, present: 1, absent: 0 });
    });

    it('trend is the last 14 dates, oldest first', () => {
      for (let day = 1; day <= 16; day += 1) {
        attendance('s-3', 'c-b', `2026-09-${String(day + 10).padStart(2, '0')}`, 'ABSENT');
      }
      const trend = readModel.getAttendanceReport({ period: 'MONTHLY' }, NOW).trendData;
      expect(trend).toHaveLength(14);
      expect(trend.at(-1)!.date).toBe('2026-10-19');
      expect(trend.map((t) => t.date)).toEqual([...trend.map((t) => t.date)].sort());
      expect(trend.find((t) => t.date === '2026-10-18')).toEqual({ date: '2026-10-18', rate: 0, present: 0, absent: 1 });
    });

    it('the school filter narrows records; the scope name is the district', () => {
      const r = report({ districtId: 'd-1', schoolId: 'sch-a' });
      expect(r.summary.totalRecords).toBe(5);
      expect(r.bySchool.map((s) => s.schoolId)).toEqual(['sch-a']);
      expect(r.scopeName).toBe('Buchanan');
    });
  });

  describe('getAcademicReport', () => {
    beforeEach(() => {
      period('gp-a', 'sch-a', 'y-a');
      period('gp-a-old', 'sch-a', 'y-a-old');
      period('gp-b', 'sch-b', 'y-b');
      subject('m-a', 'sch-a', 'Mathematics');
      subject('e-a', 'sch-a', 'English');
      subject('m-b', 'sch-b', 'mathematics ');
      run(`INSERT INTO assessment_templates (id,classId,subjectId,name,type,totalMarks,weight,date,createdAt,updatedAt)
           VALUES ('t-a','c-a','m-a','Quiz','TEST',20,NULL,'2025-10-01',?,?)`, STAMP, STAMP);
      run(`INSERT INTO assessments (id,templateId,classId,subjectId,gradingPeriodId,name,type,totalMarks,weight,date,createdAt,updatedAt)
           VALUES ('as-a','t-a','c-a','m-a','gp-a','Quiz','TEST',20,NULL,'2025-10-01',?,?)`, STAMP, STAMP);
      run(`INSERT INTO institution_grading_configs (id,institutionId,maxMarks,passingMarks,periodsPerTerm,termsPerYear,hasExams,
             calculationMethod,gradeScale,allowLateSubmission,lateSubmissionPenalty,requireAdminApproval,createdAt,updatedAt)
           VALUES ('cfg-a','sch-a',100,70,3,2,1,'AVERAGE','[]',0,NULL,0,?,?)`, STAMP, STAMP);
      grade('g1', 's-1', 'm-a', 60);
      grade('g2', 's-2', 'm-a', 15, { periodId: null, assessmentId: 'as-a' });
      grade('g3', 's-1', 'e-a', 90);
      grade('g4', 's-1', 'm-a', 100, { published: 0 });
      grade('g5', 's-1', 'm-a', 100, { periodId: 'gp-a-old' });
      grade('g6', 's-3', 'm-b', 60, { periodId: 'gp-b' });
      grade('g7', 's-gone', 'm-a', 100);
      grade('g8', 's-3', 'm-a', 80);
    });

    it('only published grades in a current-year period count, via the grade or its assessment period', () => {
      expect(readModel.getAcademicReport({}).summary).toEqual({
        totalSchools: 2, totalGrades: 5, averageScore: 73, passRate: 80, passCount: 4, failCount: 1,
      });
    });

    it('pass uses the school config, 50% without one; percentage uses the assessment total; a grade is credited to its subject school', () => {
      expect(readModel.getAcademicReport({}).bySchool).toEqual([
        {
          schoolId: 'sch-a', schoolName: 'Alpha School', schoolCode: 'SCH-A-CODE', totalGrades: 4, averageScore: 76,
          passRate: 75, districtId: 'd-1', districtName: 'Buchanan',
        },
        {
          schoolId: 'sch-b', schoolName: 'Beta School', schoolCode: 'SCH-B-CODE', totalGrades: 1, averageScore: 60,
          passRate: 100, districtId: 'd-2', districtName: 'Owensgrove',
        },
      ]);
    });

    it('subjects group by name across schools', () => {
      expect(readModel.getAcademicReport({}).bySubject).toEqual([
        { subjectId: 'm-a', subjectName: 'Mathematics', totalGrades: 4, averageScore: 69, passRate: 75 },
        { subjectId: 'e-a', subjectName: 'English', totalGrades: 1, averageScore: 90, passRate: 100 },
      ]);
    });

    it('a district report narrows to its schools', () => {
      const r = readModel.getAcademicReport({ districtId: 'd-2' });
      expect(r.summary.totalGrades).toBe(1);
      expect(r.scopeName).toBe('Owensgrove');
    });
  });

  describe('getStaffComplianceReport', () => {
    beforeEach(() => {
      staff('t1', 'sch-a', 'TEACHER', ['B.Ed']);
      staff('t2', 'sch-a', 'ASSISTANT_TEACHER', { summary: 'Diploma' });
      staff('t3', 'sch-a', 'TEACHER', []);
      staff('t4', 'sch-a', 'PRINCIPAL', ['M.Ed']);
      staff('t5', 'sch-a', 'TEACHER', ['B.Ed'], 0);
      staff('t6', 'sch-b', 'SECURITY', null);
    });

    it('teachers are TEACHER and ASSISTANT_TEACHER; staff are all active staff; summary qualifications count', () => {
      const r = readModel.getStaffComplianceReport({});
      expect(r.summary).toEqual({
        totalSchools: 2, totalStudents: 3, totalStaff: 5, totalTeachers: 3, qualifiedTeachers: 2,
        qualificationRate: 67, overallTeacherStudentRatio: '1.0',
      });
      expect(r.bySchool[0]).toEqual({
        schoolId: 'sch-a', schoolName: 'Alpha School', schoolCode: 'SCH-A-CODE', totalStudents: 2, totalStaff: 4,
        totalTeachers: 3, qualifiedTeachers: 2, teacherStudentRatio: '0.7', isCompliant: true,
        districtId: 'd-1', districtName: 'Buchanan',
      });
    });

    it('no teachers is non-compliant with an N/A ratio', () => {
      const r = readModel.getStaffComplianceReport({});
      expect(r.bySchool[1]).toMatchObject({ totalTeachers: 0, teacherStudentRatio: 'N/A', isCompliant: false });
      expect(r.complianceStatus).toEqual({ compliant: 1, nonCompliant: 1, total: 2, complianceRate: 50 });
    });

    it('compliance is at most 40 students per teacher', () => {
      for (let i = 0; i < 79; i += 1) student(`b-${i}`, 'sch-b');
      staff('t7', 'sch-b', 'TEACHER', []);
      staff('t8', 'sch-b', 'TEACHER', []);
      expect(readModel.getStaffComplianceReport({ districtId: 'd-2' }).bySchool[0]).toMatchObject({
        totalStudents: 80, teacherStudentRatio: '40.0', isCompliant: true,
      });
      student('b-80', 'sch-b');
      expect(readModel.getStaffComplianceReport({ districtId: 'd-2' }).bySchool[0]).toMatchObject({
        totalStudents: 81, teacherStudentRatio: '40.5', isCompliant: false,
      });
    });
  });
});
