import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError } from '@nemis-desktop/shared';
import type { ReportCardPayloadV1 } from '@nemis-desktop/types';
import { createTestContext, type TestContext } from '../../../testing/createTestContext';
import { ReportCardPayloadCorruptError, SqliteReportCardReadModel } from './SqliteReportCardReadModel';

const NOW = '2026-07-01T00:00:00.000Z';
const ADMIN = { teacherUserId: null };
const TEACHER = { teacherUserId: 'user-t1' };

describe('SqliteReportCardReadModel', () => {
  let test: TestContext;
  let model: SqliteReportCardReadModel;
  const run = (sql: string, ...args: unknown[]) => test.context.connection.prepare(sql).run(...args);

  // Years are created ACTIVE (a CLOSED year refuses new terms and classes) and closed afterwards.
  const statuses = new Map<string, string>();
  const year = (id: string, code: string, start: string, status: string, institutionId = 'inst-1') => {
    statuses.set(id, status);
    run(
      `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,status,version,updatedAt)
       VALUES (?,?,?,?,?,0,'ACTIVE',1,?)`,
      id, institutionId, code, start, '2099-01-01', NOW,
    );
  };
  const term = (id: string, yearId: string, name: string, start: string) =>
    run(
      `INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt) VALUES (?,?,?,?,?,0,1,?)`,
      id, yearId, name, start, '2099-01-01', NOW,
    );
  const period = (id: string, yearId: string, termId: string, name: string, sequence: number) =>
    run(
      `INSERT INTO grading_periods (id,institutionId,academicYearId,termId,name,code,periodType,sequence,maxMarks,passingMarks,weight,startDate,endDate,isActive,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?,?,100,50,NULL,?,?,1,?,?)`,
      id, 'inst-1', yearId, termId, name, `P${sequence}`, 'REGULAR_PERIOD', sequence, '2026-01-01', '2026-02-01', NOW, NOW,
    );
  const klass = (id: string, yearId: string, name: string, gradeLevel: string) =>
    run(
      `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt) VALUES (?,?,?,?,?,1,1,?)`,
      id, 'inst-1', yearId, name, gradeLevel, NOW,
    );
  const student = (id: string, nemisId: string | null, first: string, last: string) =>
    run(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,isActive,version,updatedAt)
       VALUES (?,?,?,?,?,?,?,1,1,?)`,
      id, 'inst-1', first, last, nemisId, '2012-01-01', 'FEMALE', NOW,
    );
  const card = (id: string, studentId: string, yearId: string, classId: string, institutionId = 'inst-1') =>
    run(
      `INSERT INTO report_cards (id,studentId,institutionId,academicYearId,classId,gradeLevel,createdAt,updatedAt)
       VALUES (?,?,?,?,?,'GRADE_7',?,?)`,
      id, studentId, institutionId, yearId, classId, NOW, NOW,
    );
  const payload = (studentId: string, classId: string, className: string, yearName: string, periodName: string | null) =>
    JSON.stringify({
      schemaVersion: 1,
      kind: periodName ? 'PERIOD' : 'FINAL',
      issuedForPeriod: periodName ? { id: 'x', name: periodName } : null,
      school: { id: 'inst-1', name: 'S', principalName: null },
      student: { id: studentId, nemisId: '1', firstName: 'A', middleName: null, lastName: 'B' },
      class: { id: classId, name: className, gradeLevel: 'GRADE_7' },
      academicYear: { id: 'y', name: yearName },
      terms: [],
      columns: [],
      subjects: [],
      overall: {},
      attendance: { present: 0, absent: 0, late: 0, excused: 0, sick: 0, carriedDays: 0 },
      passMark: 50,
      outcome: null,
      principalRemark: null,
    } satisfies ReportCardPayloadV1);
  const issue = (
    id: string,
    cardId: string,
    o: { gp?: string | null; version?: number; status?: string; issuedAt?: string; payload: string; kind?: string },
  ) =>
    run(
      `INSERT INTO report_card_issues (id,reportCardId,kind,gradingPeriodId,version,status,payload,issuedAt,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id, cardId, o.kind ?? 'PERIOD', o.gp ?? null, o.version ?? 1, o.status ?? 'CURRENT', o.payload,
      o.issuedAt ?? '2026-03-01T00:00:00.000Z', NOW, NOW,
    );
  const staff = (staffId: string, userId: string | null) =>
    run(
      `INSERT INTO staff (id,institutionId,userId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,createdAt,updatedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      staffId, 'inst-1', userId, 'T', 'Teacher', '1980-01-01', 'MALE', '1', staffId, 'TEACHER', 'FULL_TIME', '2020-01-01', NOW, NOW,
    );
  const workspaceSchool = (institutionId: string) =>
    run(
      `INSERT INTO provisioning_metadata (id,status,institutionId,startedAt,updatedAt) VALUES ('singleton','complete',?,?,?)`,
      institutionId, NOW, NOW,
    );

  beforeEach(() => {
    test = createTestContext();
    test.context.connection.pragma('foreign_keys = OFF');
    model = new SqliteReportCardReadModel(test.context);

    year('y-old', '2025/2026', '2025-09-01', 'CLOSED');
    year('y-re', '2024/2025', '2024-09-01', 'REOPENED');
    year('y-now', '2026/2027', '2026-09-01', 'ACTIVE');
    year('y-other', '2025/2026', '2025-09-01', 'CLOSED', 'inst-2');
    term('t-1', 'y-old', 'First', '2025-09-01');
    term('t-2', 'y-old', 'Second', '2026-01-15');
    period('gp-1', 'y-old', 't-1', 'Period 1', 1);
    period('gp-2', 'y-old', 't-1', 'Period 2', 2);
    period('gp-3', 'y-old', 't-2', 'Period 3', 1);
    klass('c-7a', 'y-old', '7A', 'GRADE_7');
    klass('c-8b', 'y-old', '8B', 'GRADE_8');
    klass('c-6', 'y-re', '6A', 'GRADE_6');
    klass('c-now', 'y-now', '7A', 'GRADE_7');
    student('s-1', 'NID1', 'Musu', 'Zubah');
    student('s-2', 'NID2', 'Ama', 'Kollie');
    student('s-3', null, 'Ben', 'Yeah');
    staff('st-1', 'user-t1');
    // The teacher teaches 7A as class teacher and 6A as a subject teacher.
    run(`INSERT INTO class_teachers (id,classId,staffId,isClassTeacher,assignedAt,updatedAt) VALUES ('ct-1','c-7a','st-1',1,?,?)`, NOW, NOW);
    run(`INSERT INTO class_subject_teachers (id,classId,subjectId,staffId,assignedAt,updatedAt) VALUES ('cst-1','c-6','sub-1','st-1',?,?)`, NOW, NOW);
    for (const [id, status] of statuses) run(`UPDATE academic_years SET status = ? WHERE id = ?`, status, id);
  });
  afterEach(() => test.cleanup());

  function seedCards() {
    // s-1: a 2025/2026 card in 7A (issues inserted out of order, period 1 re-issued) and a 2026/2027 card.
    card('rc-1', 's-1', 'y-old', 'c-7a');
    issue('i-p3', 'rc-1', { gp: 'gp-3', issuedAt: '2026-05-01T00:00:00.000Z', payload: payload('s-1', 'c-7a', '7A', '2025/2026', 'Period 3') });
    issue('i-p1v1', 'rc-1', { gp: 'gp-1', version: 1, status: 'SUPERSEDED', payload: payload('s-1', 'c-7a', '7A', '2025/2026', 'Period 1') });
    issue('i-p1v2', 'rc-1', { gp: 'gp-1', version: 2, payload: payload('s-1', 'c-7a', '7A', '2025/2026', 'Period 1') });
    issue('i-p2', 'rc-1', { gp: 'gp-2', status: 'WITHDRAWN', payload: payload('s-1', 'c-7a', '7A', '2025/2026', 'Period 2') });
    card('rc-now', 's-1', 'y-now', 'c-now');
    issue('i-now', 'rc-now', { kind: 'FINAL', payload: payload('s-1', 'c-now', '7A', '2026/2027', null) });
    // s-2 in 7A, and in 6A of the reopened year.
    card('rc-2', 's-2', 'y-old', 'c-7a');
    issue('i-2a', 'rc-2', { gp: 'gp-1', issuedAt: '2026-03-01T00:00:00.000Z', payload: payload('s-2', 'c-7a', '7A', '2025/2026', 'Period 1') });
    issue('i-2b', 'rc-2', { gp: 'gp-2', issuedAt: '2026-04-01T00:00:00.000Z', payload: payload('s-2', 'c-7a', '7A', '2025/2026', 'Period 2') });
    card('rc-6', 's-2', 'y-re', 'c-6');
    issue('i-6', 'rc-6', { kind: 'FINAL', payload: payload('s-2', 'c-6', '6A', '2024/2025', null) });
    // s-3 in 8B, a class the teacher does not teach.
    card('rc-3', 's-3', 'y-old', 'c-8b');
    issue('i-3', 'rc-3', { gp: 'gp-1', payload: payload('s-3', 'c-8b', '8B', '2025/2026', 'Period 1') });
    // Another school.
    card('rc-x', 's-x', 'y-other', 'c-x', 'inst-2');
    issue('i-x', 'rc-x', { kind: 'FINAL', payload: payload('s-x', 'c-x', 'X', '2025/2026', null) });
  }

  describe('a corrupt stored payload', () => {
    it('does not break lists, and getIssue says so clearly', () => {
      seedCards();
      workspaceSchool('inst-1');
      run(`UPDATE report_card_issues SET payload = '{not json' WHERE id IN ('i-p3', 'i-2b', 'i-6')`);
      const rows = model.listForStudent(ADMIN, 's-1');
      expect(rows.map((r) => r.issueId)).toEqual(['i-now', 'i-p1v2', 'i-p1v1', 'i-p2', 'i-p3']);
      // Names fall back to the live rows.
      expect(rows.find((r) => r.issueId === 'i-p3')).toMatchObject({
        academicYearName: '2025/2026',
        className: '7A',
        gradingPeriodName: 'Period 3',
      });
      expect(model.listForClass(ADMIN, 'c-7a').map((r) => r.student.fullName)).toEqual(['Ama Kollie', 'Musu Zubah']);
      expect(model.listArchivedYears(ADMIN).map((y) => y.classes.map((c) => c.name))).toEqual([['7A', '8B'], ['6A']]);
      expect(() => model.getIssue(ADMIN, 'i-p3')).toThrow(ReportCardPayloadCorruptError);
      expect(() => model.getIssue(ADMIN, 'i-p3')).toThrow(/could not be read/);
    });
  });

  describe('a teacher at one school', () => {
    it("cannot see another school's cards on any channel, even in a class id they are assigned to", () => {
      seedCards();
      workspaceSchool('inst-1');
      run(`INSERT INTO class_teachers (id,classId,staffId,isClassTeacher,assignedAt,updatedAt) VALUES ('ct-x','c-x','st-1',0,?,?)`, NOW, NOW);
      expect(model.listForStudent(TEACHER, 's-x')).toEqual([]);
      expect(model.listForClass(TEACHER, 'c-x')).toEqual([]);
      expect(() => model.getIssue(TEACHER, 'i-x')).toThrow(ForbiddenError);
      expect(model.listArchivedYears(TEACHER).map((y) => y.academicYearId)).not.toContain('y-other');
    });
  });

  describe('listForStudent', () => {
    it('lists every issue, newest year first, then grading-period order, newest version first', () => {
      seedCards();
      const rows = model.listForStudent(ADMIN, 's-1');
      expect(rows.map((r) => r.issueId)).toEqual(['i-now', 'i-p1v2', 'i-p1v1', 'i-p2', 'i-p3']);
      expect(rows[1]).toEqual({
        issueId: 'i-p1v2',
        reportCardId: 'rc-1',
        studentId: 's-1',
        academicYearId: 'y-old',
        academicYearName: '2025/2026',
        classId: 'c-7a',
        className: '7A',
        kind: 'PERIOD',
        gradingPeriodName: 'Period 1',
        version: 2,
        status: 'CURRENT',
        issuedAt: '2026-03-01T00:00:00.000Z',
      });
      expect(rows[0]!.gradingPeriodName).toBeNull();
    });

    it('is empty for a student with no cards', () => {
      seedCards();
      expect(model.listForStudent(ADMIN, 'nobody')).toEqual([]);
      expect(model.listForStudent(TEACHER, 'nobody')).toEqual([]);
    });

    it('shows a teacher only the cards of classes they teach, in any year', () => {
      seedCards();
      expect(model.listForStudent(TEACHER, 's-2').map((r) => r.issueId)).toEqual(['i-2a', 'i-2b', 'i-6']);
      expect(model.listForStudent(TEACHER, 's-1').map((r) => r.classId)).not.toContain('c-now');
    });

    it('refuses a teacher a student who only has cards in classes they do not teach', () => {
      seedCards();
      expect(() => model.listForStudent(TEACHER, 's-3')).toThrow(ForbiddenError);
    });

    it('refuses a teacher with no staff record', () => {
      seedCards();
      expect(() => model.listForStudent({ teacherUserId: 'user-none' }, 's-1')).toThrow(ForbiddenError);
    });

    it('shows an admin of another school nothing', () => {
      seedCards();
      workspaceSchool('inst-2');
      expect(model.listForStudent(ADMIN, 's-1')).toEqual([]);
    });
  });

  describe('listForClass', () => {
    it('gives each student their latest CURRENT issue, sorted by last name', () => {
      seedCards();
      const rows = model.listForClass(ADMIN, 'c-7a');
      expect(rows.map((r) => [r.student.id, r.latest?.issueId])).toEqual([
        ['s-2', 'i-2b'],
        ['s-1', 'i-p3'],
      ]);
      expect(rows[0]!.student).toEqual({ id: 's-2', nemisId: 'NID2', fullName: 'Ama Kollie' });
    });

    it('has a null latest when nothing is CURRENT', () => {
      seedCards();
      run(`UPDATE report_card_issues SET status='WITHDRAWN' WHERE reportCardId='rc-2'`);
      expect(model.listForClass(ADMIN, 'c-7a').find((r) => r.student.id === 's-2')!.latest).toBeNull();
    });

    it('allows a teacher their own classes and refuses another', () => {
      seedCards();
      expect(model.listForClass(TEACHER, 'c-7a')).toHaveLength(2);
      expect(model.listForClass(TEACHER, 'c-6')).toHaveLength(1);
      expect(() => model.listForClass(TEACHER, 'c-8b')).toThrow(ForbiddenError);
    });

    it('shows an admin of another school nothing', () => {
      seedCards();
      workspaceSchool('inst-2');
      expect(model.listForClass(ADMIN, 'c-7a')).toEqual([]);
    });
  });

  describe('getIssue', () => {
    it('returns the summary and the parsed payload', () => {
      seedCards();
      const detail = model.getIssue(ADMIN, 'i-p3');
      expect(detail.summary).toMatchObject({ issueId: 'i-p3', gradingPeriodName: 'Period 3', className: '7A' });
      expect(detail.payload.schemaVersion).toBe(1);
      expect(detail.payload.class.name).toBe('7A');
    });

    it('refuses a teacher another class, and anyone an unknown issue or another school', () => {
      seedCards();
      expect(model.getIssue(TEACHER, 'i-p3').summary.issueId).toBe('i-p3');
      expect(() => model.getIssue(TEACHER, 'i-3')).toThrow(ForbiddenError);
      expect(() => model.getIssue(ADMIN, 'missing')).toThrow(ForbiddenError);
      workspaceSchool('inst-2');
      expect(() => model.getIssue(ADMIN, 'i-p3')).toThrow(ForbiddenError);
    });
  });

  describe('listArchivedYears', () => {
    it('lists closed and reopened years that hold cards, newest first, with their classes', () => {
      seedCards();
      workspaceSchool('inst-1');
      expect(model.listArchivedYears(ADMIN)).toEqual([
        {
          academicYearId: 'y-old',
          code: '2025/2026',
          status: 'CLOSED',
          classes: [
            { classId: 'c-7a', name: '7A', gradeLevel: 'GRADE_7' },
            { classId: 'c-8b', name: '8B', gradeLevel: 'GRADE_8' },
          ],
        },
        {
          academicYearId: 'y-re',
          code: '2024/2025',
          status: 'REOPENED',
          classes: [{ classId: 'c-6', name: '6A', gradeLevel: 'GRADE_6' }],
        },
      ]);
    });

    it('omits years without cards and never lists an ACTIVE year', () => {
      expect(model.listArchivedYears(ADMIN)).toEqual([]);
      seedCards();
      expect(model.listArchivedYears(ADMIN).map((y) => y.academicYearId)).not.toContain('y-now');
    });

    it('limits a teacher to the classes they teach', () => {
      seedCards();
      workspaceSchool('inst-1');
      expect(
        model.listArchivedYears(TEACHER).map((y) => [y.academicYearId, y.classes.map((c) => c.classId)]),
      ).toEqual([
        ['y-old', ['c-7a']],
        ['y-re', ['c-6']],
      ]);
    });

    it('shows an admin of another school only that school', () => {
      seedCards();
      workspaceSchool('inst-2');
      expect(model.listArchivedYears(ADMIN).map((y) => y.academicYearId)).toEqual(['y-other']);
    });
  });
});
