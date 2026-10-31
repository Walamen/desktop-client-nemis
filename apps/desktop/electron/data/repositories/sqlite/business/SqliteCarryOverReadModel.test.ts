import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { SqliteCarryOverReadModel } from './SqliteCarryOverReadModel';

describe('SqliteCarryOverReadModel', () => {
  let test: TestContext;
  let model: SqliteCarryOverReadModel;
  const NOW = '2026-10-20T00:00:00.000Z';

  const year = (id: string, status: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,status,version,updatedAt)
         VALUES (?,?,?,?,?,1,?,1,?)`,
      )
      .run(id, 'i-1', id, '2025-09-01', '2026-07-31', status, NOW);
  const student = (id: string, firstName: string, lastName: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
         VALUES (?,?,?,?,?,?,?,1,1,?)`,
      )
      .run(id, 'i-1', firstName, lastName, `n-${id}`, '2012-05-01', 'FEMALE', NOW);
  const carryOver = (id: string, studentId: string, yearId: string, status: string, createdAt = NOW) =>
    test.context.connection
      .prepare(
        `INSERT INTO transfer_carry_overs (id,studentId,institutionId,academicYearId,fromInstitutionName,enrolledAt,status,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, studentId, 'i-1', yearId, 'Alpha School', NOW, status, createdAt, NOW);

  const enrol = (studentId: string, yearId: string, status = 'ACTIVE') =>
    test.context.connection
      .prepare(
        `INSERT INTO enrollments (id,studentId,classId,academicYearId,termId,enrollmentDate,status,version,updatedAt)
         VALUES (?,?,?,?,?,?,?,1,?)`,
      )
      .run(`e-${studentId}-${yearId}`, studentId, 'c-1', yearId, 't-1', NOW, status, NOW);
  const period = (id: string, yearId: string, endDate: string) =>
    test.context.connection
      .prepare(
        `INSERT INTO grading_periods (id,institutionId,academicYearId,termId,name,code,periodType,sequence,maxMarks,passingMarks,startDate,endDate,isActive,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,1,100,50,?,?,1,?,?)`,
      )
      .run(id, 'i-1', yearId, 't-1', id, id, 'REGULAR_PERIOD', '2025-09-01T00:00:00.000Z', endDate, NOW, NOW);

  beforeEach(() => {
    test = createTestContext();
    test.context.connection.pragma('foreign_keys = OFF');
    model = new SqliteCarryOverReadModel(test.context);
  });
  afterEach(() => test.cleanup());

  it('lists the PENDING tasks of the ACTIVE year, oldest first, with the student name', () => {
    year('y-active', 'ACTIVE');
    year('y-closed', 'CLOSED');
    student('s-1', 'Ama', 'Kofi');
    student('s-2', 'Kofi', 'Mensah');
    carryOver('co-2', 's-2', 'y-active', 'PENDING', '2026-10-21T00:00:00.000Z');
    carryOver('co-1', 's-1', 'y-active', 'PENDING', '2026-10-19T00:00:00.000Z');
    carryOver('co-saved', 's-1', 'y-active', 'SAVED');
    carryOver('co-old', 's-1', 'y-closed', 'PENDING');
    enrol('s-1', 'y-active');
    enrol('s-2', 'y-active');
    expect(model.listPending()).toEqual([
      { id: 'co-1', studentId: 's-1', studentName: 'Ama Kofi', fromInstitutionName: 'Alpha School', createdAt: '2026-10-19T00:00:00.000Z' },
      { id: 'co-2', studentId: 's-2', studentName: 'Kofi Mensah', fromInstitutionName: 'Alpha School', createdAt: '2026-10-21T00:00:00.000Z' },
    ]);
  });

  const carried = (id: string, studentId: string, subjectId: string | null, periodId: string | null) =>
    test.context.connection
      .prepare(
        `INSERT INTO carried_grades (id,carryOverId,studentId,sourceSchoolName,targetSubjectId,targetGradingPeriodId,percentage,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, 'co-1', studentId, 'Alpha School', subjectId, periodId, 72, NOW, NOW);

  it('returns the carried marks of one period and subject, matched rows only', () => {
    carried('g-1', 's-1', 'math', 'p-1');
    carried('g-2', 's-2', 'math', 'p-2');
    carried('g-3', 's-3', 'eng', 'p-1');
    carried('g-4', 's-4', null, null);
    expect(model.carriedFor('p-1', 'math')).toEqual([
      { studentId: 's-1', percentage: 72, sourceSchoolName: 'Alpha School' },
    ]);
  });

  it('hides the task of a child who has left the school that year', () => {
    year('y-active', 'ACTIVE');
    student('s-1', 'Ama', 'Kofi');
    carryOver('co-1', 's-1', 'y-active', 'PENDING');
    enrol('s-1', 'y-active', 'TRANSFERRED');
    expect(model.listPending()).toEqual([]);
  });

  it('names the students whose pending matching blocks a period that ended before they joined', () => {
    year('y-active', 'ACTIVE');
    // NOW (2026-10-20) is the enrolledAt of every carry-over in this file.
    period('p-early', 'y-active', '2025-10-15T00:00:00.000Z');
    period('p-late', 'y-active', '2027-01-15T00:00:00.000Z');
    carryOver('co-1', 's-1', 'y-active', 'PENDING');
    carryOver('co-2', 's-2', 'y-active', 'SAVED');
    expect(model.pendingStudentsFor('p-early')).toEqual(['s-1']);
    expect(model.pendingStudentsFor('p-late')).toEqual([]);
  });

  it('lists nothing when there are no tasks', () => {
    expect(model.listPending()).toEqual([]);
  });
});
