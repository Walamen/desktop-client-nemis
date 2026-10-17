import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCountyStudentsReadModel } from './SqliteCountyStudentsReadModel';

const NOW = '2026-01-01T00:00:00.000Z';

describe('SqliteCountyStudentsReadModel', () => {
  let test: TestContext;
  let db: TestContext['context']['connection'];
  let readModel: SqliteCountyStudentsReadModel;
  let seq = 0;

  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const school = (id: string, name: string, districtId: string, isActive = 1) =>
    run(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,districtId,approvalStatus,version,updatedAt,isActive)
       VALUES (?,?,?,'SCHOOL','GOVERNMENT','county-1',?,'APPROVED',1,?,?)`,
      id, id.toUpperCase(), name, districtId, NOW, isActive,
    );
  const student = (id: string, institutionId: string, lastName: string, opts: { first?: string; gender?: string; isActive?: number; nemisId?: string } = {}) => {
    seq += 1;
    run(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt,photoUrl,nationalId)
       VALUES (?,?,?,?,?,'2014-02-03',?,?,1,?,NULL,NULL)`,
      id, institutionId, opts.first ?? 'Pupil', lastName, opts.nemisId ?? String(seq).padStart(12, '0'),
      opts.gender ?? 'FEMALE', opts.isActive ?? 1, NOW,
    );
  };
  const year = (id: string, institutionId: string, code: string, startDate: string, isCurrent = 0) => {
    run(
      `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt) VALUES (?,?,?,?,?,?,1,?)`,
      id, institutionId, code, startDate, startDate.replace(/^(\d{4})/, (y) => String(Number(y) + 1)), isCurrent, NOW,
    );
    run(`INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt) VALUES (?,?,?,?,?,0,1,?)`,
      `t-${id}`, id, 'Term 1', startDate, startDate, NOW);
  };
  const klass = (id: string, institutionId: string, yearId: string, name: string, gradeLevel: string) =>
    run(`INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt) VALUES (?,?,?,?,?,1,1,?)`,
      id, institutionId, yearId, name, gradeLevel, NOW);
  const enrol = (id: string, studentId: string, classId: string, yearId: string, date: string, status = 'ACTIVE') =>
    run(`INSERT INTO enrollments (id,studentId,classId,academicYearId,termId,enrollmentDate,status,version,updatedAt) VALUES (?,?,?,?,?,?,?,1,?)`,
      id, studentId, classId, yearId, id === 'e-dup' ? 't-y2' : `t-${yearId}`, date, status, NOW);
  const average = (id: string, studentId: string, yearId: string, percentage: number, calculatedAt: string) =>
    run(`INSERT INTO term_averages (id,studentId,subjectId,termId,classId,percentage,calculatedAt,updatedAt) VALUES (?,?,'sub',?,'c',?,?,?)`,
      id, studentId, `t-${yearId}`, percentage, calculatedAt, NOW);
  const attendance = (id: string, studentId: string, classId: string, status: string) =>
    run(`INSERT INTO attendance (id,studentId,classId,date,status,version,updatedAt) VALUES (?,?,?,?,?,1,?)`,
      id, studentId, classId, `2025-10-0${(seq++ % 9) + 1}`, status, NOW);

  beforeEach(() => {
    test = createTestContext();
    db = test.context.connection;
    readModel = new SqliteCountyStudentsReadModel(test.context);
    seq = 0;
    run(`INSERT INTO counties (id,code,name) VALUES ('county-1','GB','Grand Bassa')`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-1','Buchanan','county-1',1)`);
    run(`INSERT INTO districts (id,name,countyId,isActive) VALUES ('d-2','Owensgrove','county-1',1)`);
    school('sch-a', 'Alpha School', 'd-1');
    school('sch-b', 'Beta School', 'd-2');
    school('sch-closed', 'Closed School', 'd-1', 0);
  });
  afterEach(() => test.cleanup());

  const query = (extra: Record<string, unknown> = {}) => ({ page: 1, limit: 12, ...extra });

  it('lists active-school students by last name with current class and performance label', () => {
    student('s-b', 'sch-a', 'Bravo');
    student('s-a', 'sch-b', 'Able');
    student('s-x', 'sch-closed', 'Aaron');
    year('y1', 'sch-a', '2025/2026', '2025-09-01', 1);
    klass('c-5a', 'sch-a', 'y1', '5A', 'GRADE_5');
    enrol('e-1', 's-b', 'c-5a', 'y1', '2025-09-02');
    [10, 82, 84, 86, 88, 90].forEach((p, i) => average(`ta-${i}`, 's-b', 'y1', p, `2025-0${i + 1}-01T00:00:00.000Z`));

    const page = readModel.listStudents(query());
    expect(page.data.map((s) => s.id)).toEqual(['s-a', 's-b']);
    expect(page.data[1]).toMatchObject({
      institution: { id: 'sch-a', name: 'Alpha School', districtName: 'Buchanan', countyName: 'Grand Bassa' },
      currentClass: { name: '5A', gradeLevel: 'GRADE_5' },
      avgPercentage: 86,
      performanceLabel: 'Excellent',
    });
    expect(page.data[0]).toMatchObject({ currentClass: null, avgPercentage: null, performanceLabel: null });
    expect(page).toMatchObject({ total: 2, page: 1, limit: 12, totalPages: 1 });
    expect(page.schools).toEqual([{ id: 'sch-a', name: 'Alpha School' }, { id: 'sch-b', name: 'Beta School' }]);
  });

  it('filters by district, school, status, grade (active enrollment) and search on name or NEMIS ID', () => {
    student('s-1', 'sch-a', 'Kollie', { first: 'Ada', nemisId: '111122223333' });
    student('s-2', 'sch-b', 'Doe', { isActive: 0 });
    year('y1', 'sch-a', '2025/2026', '2025-09-01', 1);
    klass('c-5a', 'sch-a', 'y1', '5A', 'GRADE_5');
    enrol('e-1', 's-1', 'c-5a', 'y1', '2025-09-02');
    const ids = (extra: Record<string, unknown>) => readModel.listStudents(query(extra)).data.map((s) => s.id);
    expect(ids({ districtId: 'd-2' })).toEqual(['s-2']);
    expect(ids({ institutionId: 'sch-a' })).toEqual(['s-1']);
    expect(ids({ status: 'inactive' })).toEqual(['s-2']);
    expect(ids({ status: 'active' })).toEqual(['s-1']);
    expect(ids({ gradeLevel: 'GRADE_5' })).toEqual(['s-1']);
    expect(ids({ search: 'ada' })).toEqual(['s-1']);
    expect(ids({ search: '2222' })).toEqual(['s-1']);
  });

  it('applies the performance filter after paging, as the web does', () => {
    for (let i = 0; i < 13; i += 1) student(`s-${i}`, 'sch-a', `Name${String(i).padStart(2, '0')}`);
    year('y1', 'sch-a', '2025/2026', '2025-09-01', 1);
    average('ta-1', 's-12', 'y1', 95, '2025-10-01T00:00:00.000Z');
    expect(readModel.listStudents(query({ performance: 'Excellent' }))).toMatchObject({ data: [], total: 0, totalPages: 0 });
    const second = readModel.listStudents(query({ performance: 'Excellent', page: 2 }));
    expect(second.data.map((s) => s.id)).toEqual(['s-12']);
    expect(second).toMatchObject({ total: 1, totalPages: 1 });
  });

  it('counts total, male, female, active and inactive at active county schools', () => {
    student('s-1', 'sch-a', 'A', { gender: 'MALE' });
    student('s-2', 'sch-a', 'B', { gender: 'FEMALE' });
    student('s-3', 'sch-b', 'C', { gender: 'MALE', isActive: 0 });
    student('s-4', 'sch-closed', 'D');
    expect(readModel.listStudents(query()).stats).toEqual({ total: 3, male: 1, female: 1, active: 2, inactive: 1 });
  });

  it('builds one year row per school year with the latest class, outcome, average and attendance', () => {
    student('s-1', 'sch-a', 'Kollie');
    year('y1', 'sch-b', '2023/2024', '2023-09-01');
    year('y2', 'sch-a', '2024/2025', '2024-09-01');
    year('y3', 'sch-a', '2025/2026', '2025-09-01', 1);
    klass('c-3', 'sch-b', 'y1', '3A', 'GRADE_3');
    klass('c-4a', 'sch-a', 'y2', '4A', 'GRADE_4');
    klass('c-4b', 'sch-a', 'y2', '4B', 'GRADE_4');
    klass('c-5', 'sch-a', 'y3', '5A', 'GRADE_5');
    enrol('e-y1', 's-1', 'c-3', 'y1', '2023-09-02', 'COMPLETED');
    enrol('e-y2a', 's-1', 'c-4a', 'y2', '2024-09-02', 'COMPLETED');
    run(`INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt) VALUES ('t-y2b','y2','Term 2','2025-01-05','2025-01-05',0,1,?)`, NOW);
    run(`INSERT INTO enrollments (id,studentId,classId,academicYearId,termId,enrollmentDate,status,version,updatedAt) VALUES ('e-y2b','s-1','c-4b','y2','t-y2b','2025-01-05','COMPLETED',1,?)`, NOW);
    enrol('e-y3', 's-1', 'c-5', 'y3', '2025-09-02');
    run(`INSERT INTO grade_completions (id,studentId,institutionId,academicYearId,gradeLevel,outcome,nextGradeLevel,averageAtDecision,createdAt,updatedAt)
         VALUES ('gc-1','s-1','sch-b','y1','GRADE_3','PROMOTED','GRADE_4',71,?,?)`, NOW, NOW);
    average('ta-1', 's-1', 'y2', 60, '2025-03-01T00:00:00.000Z');
    average('ta-2', 's-1', 'y2', 80, '2025-04-01T00:00:00.000Z');
    attendance('at-1', 's-1', 'c-5', 'PRESENT');
    attendance('at-2', 's-1', 'c-5', 'PRESENT');
    attendance('at-3', 's-1', 'c-5', 'PRESENT');
    attendance('at-4', 's-1', 'c-5', 'ABSENT');

    const years = readModel.getStudent('s-1')!.years;
    expect(years.map((y) => [y.academicYearName, y.className, y.institutionName, y.outcome, y.average, y.attendanceRate, y.isCurrentYear])).toEqual([
      ['2025/2026', '5A', 'Alpha School', null, null, 75, true],
      ['2024/2025', '4B', 'Alpha School', null, 70, null, false],
      ['2023/2024', '3A', 'Beta School', 'PROMOTED', 71, null, false],
    ]);
    expect(years.every((y) => y.otherCounty === false)).toBe(true);
  });

  it('gives blank cells, not NaN, for a student with no enrolments, averages or attendance', () => {
    student('s-1', 'sch-a', 'Kollie');
    const detail = readModel.getStudent('s-1')!;
    expect(detail.years).toEqual([]);
    expect(detail.currentEnrollment).toBeNull();
    expect(detail.guardians).toEqual([]);
    expect(detail.transfers).toEqual([]);
    expect(readModel.listStudents(query()).data[0]).toMatchObject({ avgPercentage: null, performanceLabel: null });
  });

  it('lists transfers newest first with names and the reviewer when known', () => {
    student('s-1', 'sch-a', 'Kollie');
    run(`INSERT INTO users (id,firstName,lastName,email,isActive,version,updatedAt) VALUES ('u-rev','Musu','Kollie','m@x',1,1,?)`, NOW);
    const transfer = (id: string, requestedDate: string | null, createdAt: string, reviewedBy: string | null) =>
      run(`INSERT INTO student_transfers (id,studentId,fromInstitutionId,toInstitutionId,requestedBy,reason,status,reviewedBy,reviewedAt,requestedDate,createdAt,updatedAt,fromInstitutionName,toInstitutionName)
           VALUES (?,'s-1','sch-b','sch-a','u-1','Family moved','COMPLETED',?,?,?,?,?,'Beta School','Alpha School')`,
        id, reviewedBy, reviewedBy ? '2025-08-25T00:00:00.000Z' : null, requestedDate, createdAt, createdAt);
    transfer('t-old', null, '2024-01-01T00:00:00.000Z', 'u-gone');
    transfer('t-new', '2025-08-20T00:00:00.000Z', '2025-08-19T00:00:00.000Z', 'u-rev');
    expect(readModel.getStudent('s-1')!.transfers).toEqual([
      { id: 't-new', date: '2025-08-20T00:00:00.000Z', fromInstitutionName: 'Beta School', toInstitutionName: 'Alpha School',
        status: 'COMPLETED', reason: 'Family moved', reviewedByName: 'Musu Kollie', reviewedAt: '2025-08-25T00:00:00.000Z' },
      { id: 't-old', date: '2024-01-01T00:00:00.000Z', fromInstitutionName: 'Beta School', toInstitutionName: 'Alpha School',
        status: 'COMPLETED', reason: 'Family moved', reviewedByName: null, reviewedAt: '2025-08-25T00:00:00.000Z' },
    ]);
  });

  it('returns the overview fields and null for a student not on the device', () => {
    student('s-1', 'sch-a', 'Kollie', { first: 'Ada' });
    run(`UPDATE students SET nationalId='NAT-1', photoUrl='https://x/a.jpg', phoneNumber='0770', email='a@x', address='Road' WHERE id='s-1'`);
    run(`INSERT INTO guardians (id,firstName,lastName,relationship,phoneNumber,isEmergencyContact,version,updatedAt) VALUES ('g-2','Bo','Kollie','FATHER','0771',0,1,?)`, NOW);
    run(`INSERT INTO guardians (id,firstName,lastName,relationship,phoneNumber,isEmergencyContact,version,updatedAt) VALUES ('g-1','Mary','Kollie','MOTHER','0772',0,1,?)`, NOW);
    run(`INSERT INTO student_guardians (id,studentId,guardianId,isPrimary,createdAt) VALUES ('sg-2','s-1','g-2',0,?)`, NOW);
    run(`INSERT INTO student_guardians (id,studentId,guardianId,isPrimary,createdAt) VALUES ('sg-1','s-1','g-1',1,?)`, NOW);
    const detail = readModel.getStudent('s-1')!;
    expect(detail.student).toMatchObject({ id: 's-1', firstName: 'Ada', nationalId: 'NAT-1', photoUrl: 'https://x/a.jpg', isActive: true });
    expect(detail.institution).toEqual({ id: 'sch-a', name: 'Alpha School', districtName: 'Buchanan', countyName: 'Grand Bassa' });
    expect(detail.guardians.map((g) => [g.firstName, g.isPrimary])).toEqual([['Mary', true], ['Bo', false]]);
    expect(readModel.getStudent('nope')).toBeNull();
  });
});
