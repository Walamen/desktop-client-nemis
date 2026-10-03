import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DesktopScopeType,
  GradeLevel,
  SystemRole,
  type ProvisioningUser,
} from '@nemis-desktop/types';
import { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { GradeCompletionService } from './GradeCompletionService';

const admin: ProvisioningUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  firstName: 'School',
  lastName: 'Admin',
  role: SystemRole.INSTITUTION_ADMIN,
  institutionId: 'school-1',
  scope: { type: DesktopScopeType.INSTITUTION, scopeId: 'school-1', institutionId: 'school-1' },
};

const T = '2026-01-01T00:00:00.000Z';

describe('GradeCompletionService', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  function setup(user = admin) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-grade-completion-'));
    directories.push(directory);
    const workspaces = new WorkspaceManager({
      userDataDir: directory,
      masterKey: 'ab'.repeat(32),
      device: { deviceName: 'Test', platform: 'win32', osVersion: '11', appVersion: '1' },
      log: { info() {}, warn() {}, error() {} },
    });
    const db = workspaces.activate(user).database.connection;
    seed(db);
    return { workspaces, db, service: new GradeCompletionService(workspaces) };
  }

  type Db = ReturnType<typeof setup>['db'];

  function student(
    db: Db,
    id: string,
    firstName: string,
    lastName: string,
    opts: { institutionId?: string; gradeLevel?: string; isActive?: number; nemisId?: string } = {},
  ) {
    db.prepare(
      `INSERT INTO students (id,institutionId,firstName,lastName,nemisId,dateOfBirth,gender,gradeLevel,isActive,version,updatedAt)
       VALUES (?,?,?,?,?,'2014-01-01','MALE',?,?,1,?)`,
    ).run(
      id,
      opts.institutionId ?? 'school-1',
      firstName,
      lastName,
      opts.nemisId ?? null,
      opts.gradeLevel ?? GradeLevel.GRADE_7,
      opts.isActive ?? 1,
      T,
    );
  }

  function enrol(db: Db, studentId: string, classId: string, yearId: string, termId: string, status = 'ACTIVE') {
    db.prepare(
      `INSERT INTO enrollments (id,studentId,classId,academicYearId,termId,enrollmentDate,status,version,updatedAt)
       VALUES (?,?,?,?,?,'2026-01-10',?,1,?)`,
    ).run(`${studentId}-${classId}-${termId}`, studentId, classId, yearId, termId, status, T);
  }

  function stamp(
    db: Db,
    studentId: string,
    gradeLevel: string,
    outcome: string,
    nextGradeLevel: string | null,
    syncState = 'synced',
    syncError: string | null = null,
  ) {
    db.prepare(
      `INSERT INTO grade_completions
         (id,studentId,institutionId,academicYearId,gradeLevel,outcome,nextGradeLevel,notes,createdAt,updatedAt,syncState,syncError)
       VALUES (?,?,'school-1','y1',?,?,?,NULL,?,?,?,?)`,
    ).run(`gc-${studentId}`, studentId, gradeLevel, outcome, nextGradeLevel, T, T, syncState, syncError);
  }

  function seed(db: Db) {
    const year = db.prepare(
      `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt)
       VALUES (?,?,?,?,?,?,1,?)`,
    );
    year.run('y1', 'school-1', '2026', '2026-01-01', '2026-12-31', 1, T);
    year.run('y0', 'school-1', '2025', '2025-01-01', '2025-12-31', 0, T);
    year.run('y-other', 'school-2', '2026', '2026-01-01', '2026-12-31', 1, T);
    const term = db.prepare(
      `INSERT INTO terms (id,academicYearId,name,startDate,endDate,version,updatedAt) VALUES (?,?,?,?,?,1,?)`,
    );
    term.run('t1', 'y1', 'Term 1', '2026-01-01', '2026-04-30', T);
    term.run('t2', 'y1', 'Term 2', '2026-05-01', '2026-08-31', T);
    term.run('t0', 'y0', 'Term 1', '2025-01-01', '2025-04-30', T);
    term.run('tx', 'y-other', 'Term 1', '2026-01-01', '2026-04-30', T);
    const cls = db.prepare(
      `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,version,updatedAt) VALUES (?,?,?,?,?,1,?)`,
    );
    cls.run('c7', 'school-1', 'y1', '7A', GradeLevel.GRADE_7, T);
    cls.run('c8', 'school-1', 'y1', '8A', GradeLevel.GRADE_8, T);
    cls.run('c7-old', 'school-1', 'y0', '7A', GradeLevel.GRADE_7, T);
    cls.run('c7-foreign', 'school-2', 'y1', '7X', GradeLevel.GRADE_7, T);

    // Enrolled in both terms: one cohort row, not two.
    student(db, 's-enrolled', 'Abe', 'Mensah', { nemisId: '100000000001' });
    enrol(db, 's-enrolled', 'c7', 'y1', 't1');
    enrol(db, 's-enrolled', 'c7', 'y1', 't2');
    // Promoted here already: live grade moved on, enrolment COMPLETED.
    student(db, 's-promoted', 'Bea', 'Dolo', { gradeLevel: GradeLevel.GRADE_8 });
    enrol(db, 's-promoted', 'c7', 'y1', 't1', 'COMPLETED');
    stamp(db, 's-promoted', GradeLevel.GRADE_7, 'PROMOTED', GradeLevel.GRADE_8);
    // Left mid-year: now at another school and inactive here.
    student(db, 's-leaver', 'Cal', 'Kollie', { institutionId: 'school-2', isActive: 0 });
    enrol(db, 's-leaver', 'c7', 'y1', 't1');
    // Stamp only, no enrolment (pre-B.1 student) — the stamp brings them in.
    student(db, 's-stamp-only', 'Dee', 'Kollie');
    stamp(db, 's-stamp-only', GradeLevel.GRADE_7, 'RETAINED', GradeLevel.GRADE_7);
    // Mid-year correction: enrolled at GRADE_7 but stamped at GRADE_6 this year.
    student(db, 's-elsewhere', 'Eve', 'Tarr');
    enrol(db, 's-elsewhere', 'c7', 'y1', 't1');
    stamp(db, 's-elsewhere', GradeLevel.GRADE_6, 'PROMOTED', GradeLevel.GRADE_7);
    // Not in this cohort.
    student(db, 's-grade8', 'Fay', 'Boah', { gradeLevel: GradeLevel.GRADE_8 });
    enrol(db, 's-grade8', 'c8', 'y1', 't1');
    student(db, 's-last-year', 'Gus', 'Weah', { gradeLevel: GradeLevel.GRADE_8 });
    enrol(db, 's-last-year', 'c7-old', 'y0', 't0');
    student(db, 's-foreign-class', 'Hal', 'Sirleaf', { institutionId: 'school-2' });
    enrol(db, 's-foreign-class', 'c7-foreign', 'y1', 'tx');
    // Active at GRADE_7 with no enrolment or stamp: counted, never listed.
    student(db, 's-unenrolled', 'Ian', 'Cooper');
    student(db, 's-inactive', 'Jo', 'Cooper', { isActive: 0 });
    student(db, 's-other-school', 'Kim', 'Cooper', { institutionId: 'school-2' });
  }

  function row(db: Db, studentId: string) {
    return db
      .prepare(`SELECT * FROM grade_completions WHERE studentId=? AND academicYearId='y1'`)
      .get(studentId) as Record<string, unknown> | undefined;
  }

  it('derives the cohort the way getCohortForCompletion does', () => {
    const { workspaces, service } = setup();
    const result = service.getCohort('y1', GradeLevel.GRADE_7);

    // Dolo, Kollie Cal, Kollie Dee, Mensah — last name then first name.
    expect(result.rows.map((r) => r.studentId)).toEqual([
      's-promoted',
      's-leaver',
      's-stamp-only',
      's-enrolled',
    ]);
    expect(result.rows.find((r) => r.studentId === 's-enrolled')).toEqual({
      studentId: 's-enrolled',
      firstName: 'Abe',
      lastName: 'Mensah',
      nemisId: '100000000001',
      outcome: null,
      nextGradeLevel: null,
      notes: null,
      syncState: null,
      syncError: null,
    });
    expect(result.rows.find((r) => r.studentId === 's-promoted')).toMatchObject({
      outcome: 'PROMOTED',
      nextGradeLevel: GradeLevel.GRADE_8,
      syncState: 'synced',
    });
    // Only s-unenrolled: s-elsewhere is accounted for, inactive and other
    // schools' students do not count, cohort members are not missing.
    expect(result.unenrolledCount).toBe(1);
    workspaces.close();
  });

  it('writes only changed decisions, as pending, in this school', () => {
    const { workspaces, db, service } = setup();
    const before = row(db, 's-promoted');

    const result = service.save({
      academicYearId: 'y1',
      gradeLevel: GradeLevel.GRADE_7,
      decisions: [
        { studentId: 's-promoted', outcome: 'PROMOTED', nextGradeLevel: GradeLevel.GRADE_8 },
        { studentId: 's-enrolled', outcome: 'PROMOTED', nextGradeLevel: GradeLevel.GRADE_8, notes: 'Strong year' },
        { studentId: 's-stamp-only', outcome: 'RETAINED', nextGradeLevel: GradeLevel.GRADE_7, notes: 'Repeat' },
        { studentId: 's-leaver', outcome: 'GRADUATED' },
      ],
    });

    expect(result).toEqual({ saved: 3 });
    expect(row(db, 's-promoted')).toEqual(before);
    expect(row(db, 's-enrolled')).toMatchObject({
      institutionId: 'school-1',
      academicYearId: 'y1',
      gradeLevel: GradeLevel.GRADE_7,
      outcome: 'PROMOTED',
      nextGradeLevel: GradeLevel.GRADE_8,
      notes: 'Strong year',
      decidedBy: 'admin-1',
      syncState: 'pending',
      syncError: null,
    });
    expect(row(db, 's-enrolled')?.id).toEqual(expect.any(String));
    expect(row(db, 's-stamp-only')).toMatchObject({ notes: 'Repeat', syncState: 'pending' });
    expect(row(db, 's-leaver')).toMatchObject({ outcome: 'GRADUATED', nextGradeLevel: null, syncState: 'pending' });
    workspaces.close();
  });

  it('returns a changed rejected row to pending and leaves an unchanged one rejected', () => {
    const { workspaces, db, service } = setup();
    db.prepare(`UPDATE grade_completions SET syncState='rejected', syncError='Group refused' WHERE studentId IN ('s-promoted','s-stamp-only')`).run();

    service.save({
      academicYearId: 'y1',
      gradeLevel: GradeLevel.GRADE_7,
      decisions: [
        { studentId: 's-promoted', outcome: 'RETAINED', nextGradeLevel: GradeLevel.GRADE_7 },
        { studentId: 's-stamp-only', outcome: 'RETAINED', nextGradeLevel: GradeLevel.GRADE_7 },
      ],
    });

    expect(row(db, 's-promoted')).toMatchObject({
      outcome: 'RETAINED',
      nextGradeLevel: GradeLevel.GRADE_7,
      syncState: 'pending',
      syncError: null,
      amendedBy: 'admin-1',
    });
    expect(row(db, 's-stamp-only')).toMatchObject({ syncState: 'rejected', syncError: 'Group refused' });
    workspaces.close();
  });

  it('rejects GRADUATED with a next grade, and any other outcome without one, writing nothing', () => {
    const { workspaces, db, service } = setup();
    expect(() =>
      service.save({
        academicYearId: 'y1',
        gradeLevel: GradeLevel.GRADE_7,
        decisions: [
          { studentId: 's-enrolled', outcome: 'PROMOTED', nextGradeLevel: GradeLevel.GRADE_8 },
          { studentId: 's-leaver', outcome: 'GRADUATED', nextGradeLevel: GradeLevel.GRADE_8 },
        ],
      }),
    ).toThrow(/GRADUATED outcome must not carry a next grade/);
    expect(() =>
      service.save({
        academicYearId: 'y1',
        gradeLevel: GradeLevel.GRADE_7,
        decisions: [{ studentId: 's-enrolled', outcome: 'RETAINED' }],
      }),
    ).toThrow(/next grade is required/);
    expect(row(db, 's-enrolled')).toBeUndefined();
    workspaces.close();
  });

  it('rejects a decision for anyone outside that year\'s cohort, writing nothing', () => {
    const { workspaces, db, service } = setup();
    for (const outsider of ['s-elsewhere', 's-grade8', 's-last-year', 's-foreign-class', 's-unenrolled', 'nobody']) {
      expect(() =>
        service.save({
          academicYearId: 'y1',
          gradeLevel: GradeLevel.GRADE_7,
          decisions: [
            { studentId: 's-enrolled', outcome: 'PROMOTED', nextGradeLevel: GradeLevel.GRADE_8 },
            { studentId: outsider, outcome: 'PROMOTED', nextGradeLevel: GradeLevel.GRADE_8 },
          ],
        }),
      ).toThrow(new RegExp(`not in this cohort: ${outsider}`));
    }
    expect(row(db, 's-enrolled')).toBeUndefined();
    workspaces.close();
  });

  it('rejects a repeated student and another school\'s academic year', () => {
    const { workspaces, service } = setup();
    const decision = { studentId: 's-enrolled', outcome: 'PROMOTED', nextGradeLevel: GradeLevel.GRADE_8 } as const;
    expect(() =>
      service.save({ academicYearId: 'y1', gradeLevel: GradeLevel.GRADE_7, decisions: [decision, decision] }),
    ).toThrow(/more than once/);
    expect(() =>
      service.save({ academicYearId: 'y-other', gradeLevel: GradeLevel.GRADE_7, decisions: [decision] }),
    ).toThrow(/Academic year not found/);
    workspaces.close();
  });

  it('never changes students or enrolments and never writes the sync queue (D7)', () => {
    const { workspaces, db, service } = setup();
    const snapshot = () => ({
      students: db.prepare(`SELECT * FROM students ORDER BY id`).all(),
      enrollments: db.prepare(`SELECT * FROM enrollments ORDER BY id`).all(),
      queue: db.prepare(`SELECT * FROM sync_queue ORDER BY id`).all(),
    });
    const before = snapshot();

    service.save({
      academicYearId: 'y1',
      gradeLevel: GradeLevel.GRADE_7,
      decisions: [
        { studentId: 's-enrolled', outcome: 'PROMOTED', nextGradeLevel: GradeLevel.GRADE_8 },
        { studentId: 's-promoted', outcome: 'RETAINED', nextGradeLevel: GradeLevel.GRADE_7 },
        { studentId: 's-leaver', outcome: 'GRADUATED' },
      ],
    });

    expect(snapshot()).toEqual(before);
    workspaces.close();
  });

  it('refuses a workspace that is not a school admin\'s', () => {
    const { workspaces, service } = setup({
      ...admin,
      id: 'teacher-1',
      role: SystemRole.TEACHER,
      scope: { ...admin.scope, type: DesktopScopeType.TEACHER, scopeId: 'teacher-1' },
    });
    expect(() => service.getCohort('y1', GradeLevel.GRADE_7)).toThrow(/school administrator/);
    workspaces.close();
  });
});
