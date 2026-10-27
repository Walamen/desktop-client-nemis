import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DesktopScopeType, SystemRole, type ProvisioningUser } from '@nemis-desktop/types';
import { ForbiddenError } from '@nemis-desktop/shared';
import { WorkspaceManager } from '@app/workspace/WorkspaceManager';
import { YearStructureNotEmptyError } from '@app/data/errors/repositoryErrors';
import { YearStructureCopyService } from './YearStructureCopyService';

const admin: ProvisioningUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  firstName: 'School',
  lastName: 'Admin',
  role: SystemRole.INSTITUTION_ADMIN,
  institutionId: 'school-1',
  scope: { type: DesktopScopeType.INSTITUTION, scopeId: 'school-1', institutionId: 'school-1' },
};
const REFUSAL = 'Copy only into a year that is being set up and has no terms or classes yet.';

describe('YearStructureCopyService', () => {
  const directories: string[] = [];
  const open: WorkspaceManager[] = [];
  afterEach(() => {
    for (const w of open.splice(0)) w.close();
    for (const d of directories.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function setup(user: ProvisioningUser = admin) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-year-copy-'));
    directories.push(directory);
    const workspaces = new WorkspaceManager({
      userDataDir: directory,
      masterKey: 'ab'.repeat(32),
      device: { deviceName: 'Test', platform: 'win32', osVersion: '11', appVersion: '1' },
      log: { info() {}, warn() {}, error() {} },
    });
    open.push(workspaces);
    const db = workspaces.activate(user).database.connection;
    db.pragma('foreign_keys = OFF'); // seed rows the way a pull lands them, without their parents
    const now = '2026-01-01T00:00:00.000Z';
    const run = (sql: string, ...args: unknown[]) => db.prepare(sql).run(...args);
    db.prepare(
      `INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
       VALUES ('school-1','ONE','One','SECONDARY','PUBLIC','county-1','APPROVED',1,?)`,
    ).run(now);
    // Seed the way a pull does, so the seed itself is not queued.
    run(`UPDATE sync_runtime SET captureEnabled = 0 WHERE id = 'singleton'`);
    const year = (id: string, code: string, start: string, status: string, institutionId = 'school-1') =>
      run(
        `INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,status,version,updatedAt)
         VALUES (?,?,?,?,?,0,?,1,?)`,
        id, institutionId, code, start, start, status, now,
      );
    const klass = (id: string, yearId: string, name: string, isActive = 1) =>
      run(
        `INSERT INTO classes (id,institutionId,academicYearId,name,section,gradeLevel,capacity,isActive,version,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,1,?)`,
        id, 'school-1', yearId, name, 'A', 'GRADE_1', 40, isActive, now,
      );
    const staff = (id: string, isActive: number) =>
      run(
        `INSERT INTO staff (id,institutionId,firstName,lastName,dateOfBirth,gender,phoneNumber,employeeNumber,position,employmentType,dateOfJoining,isActive,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, 'school-1', 'T', id, '1980-01-01', 'MALE', '000', id, 'TEACHER', 'FULL_TIME', '2020-01-01', isActive, now, now,
      );
    const term = (id: string, yearId: string, name: string, sequence: number | null, start: string, end: string) =>
      run(
        `INSERT INTO terms (id,academicYearId,name,sequence,startDate,endDate,isCurrent,version,updatedAt)
         VALUES (?,?,?,?,?,?,0,1,?)`,
        id, yearId, name, sequence, start, end, now,
      );

    year('y-old', '2024/2025', '2024-09-01', 'CLOSED');
    year('y-new', '2026/2027', '2026-09-15', 'SETUP');
    klass('c-1', 'y-old', 'Grade 1');
    klass('c-2', 'y-old', 'Grade 2');
    klass('c-off', 'y-old', 'Grade 9', 0);
    staff('t-on', 1);
    staff('t-off', 0);
    const subject = (id: string, isActive: number) =>
      run(
        `INSERT INTO subjects (id,institutionId,name,code,isActive,version,updatedAt) VALUES (?,?,?,?,?,1,?)`,
        id, 'school-1', id, id, isActive, now,
      );
    subject('sub-1', 1);
    subject('sub-off', 0);
    run(`INSERT INTO class_subjects (id,classId,subjectId,assignedAt,version,updatedAt) VALUES ('cs-inactive','c-1','sub-off',?,1,?)`, now, now);
    run(`INSERT INTO class_subject_teachers (id,classId,subjectId,staffId,assignedAt,version,updatedAt) VALUES ('cst-inactive','c-1','sub-off','t-on',?,1,?)`, now, now);
    run(`INSERT INTO class_subjects (id,classId,subjectId,assignedAt,version,updatedAt) VALUES ('cs-1','c-1','sub-1',?,1,?)`, now, now);
    run(`INSERT INTO class_subjects (id,classId,subjectId,assignedAt,version,updatedAt) VALUES ('cs-2','c-2','sub-1',?,1,?)`, now, now);
    run(`INSERT INTO class_subjects (id,classId,subjectId,assignedAt,version,updatedAt) VALUES ('cs-off','c-off','sub-1',?,1,?)`, now, now);
    run(`INSERT INTO class_teachers (id,classId,staffId,isClassTeacher,assignedAt,version,updatedAt) VALUES ('ct-1','c-1','t-on',1,?,1,?)`, now, now);
    run(`INSERT INTO class_teachers (id,classId,staffId,isClassTeacher,assignedAt,version,updatedAt) VALUES ('ct-2','c-2','t-off',0,?,1,?)`, now, now);
    run(`INSERT INTO class_subject_teachers (id,classId,subjectId,staffId,assignedAt,version,updatedAt) VALUES ('cst-1','c-1','sub-1','t-on',?,1,?)`, now, now);
    run(`INSERT INTO class_subject_teachers (id,classId,subjectId,staffId,assignedAt,version,updatedAt) VALUES ('cst-2','c-2','sub-1','t-off',?,1,?)`, now, now);
    term('t1', 'y-old', 'Term 1', 1, '2024-09-01', '2024-12-15');
    term('t2', 'y-old', 'Term 2', 2, '2025-01-10T00:00:00.000Z', '2025-04-01T00:00:00.000Z');
    const period = (id: string, termId: string, code: string, sequence: number) =>
      run(
        `INSERT INTO grading_periods (id,institutionId,academicYearId,termId,name,code,periodType,sequence,maxMarks,passingMarks,weight,startDate,endDate,isActive,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, 'school-1', 'y-old', termId, `Period ${code}`, code, 'TEST', sequence, 100, 50, 0.5,
        '2024-09-01', '2024-10-01', 1, now, now,
      );
    period('gp-1', 't1', 'P1', 1);
    period('gp-2', 't2', 'P2', 2);
    run(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`);
    db.prepare(`DELETE FROM sync_queue`).run();

    const count = (table: string, where = '1=1') =>
      (db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${where}`).get() as { n: number }).n;
    return { db, run, term, year, service: new YearStructureCopyService(workspaces), count };
  }

  const request = { targetYearId: 'y-new', sourceYearId: 'y-old' };

  it('copies the structure with new ids, remapped links and shifted dates, and queues every row', () => {
    const { db, service, count } = setup();
    expect(service.copyStructure(request)).toEqual({ classes: 2, terms: 2, gradingPeriods: 2 });

    const classes = db.prepare(`SELECT * FROM classes WHERE academicYearId='y-new' ORDER BY name`).all() as Record<string, unknown>[];
    expect(classes.map((c) => [c.name, c.section, c.gradeLevel, c.capacity, c.institutionId])).toEqual([
      ['Grade 1', 'A', 'GRADE_1', 40, 'school-1'],
      ['Grade 2', 'A', 'GRADE_1', 40, 'school-1'],
    ]);
    expect(classes.some((c) => c.id === 'c-1' || c.id === 'c-2')).toBe(false);
    const g1 = classes[0]!.id;

    // 2024-09-01 -> 2026-09-15 is 744 days.
    const terms = db.prepare(`SELECT name,sequence,startDate,endDate,isCurrent FROM terms WHERE academicYearId='y-new' ORDER BY sequence`).all();
    expect(terms).toEqual([
      { name: 'Term 1', sequence: 1, startDate: '2026-09-15', endDate: '2026-12-29', isCurrent: 0 },
      { name: 'Term 2', sequence: 2, startDate: '2027-01-24T00:00:00.000Z', endDate: '2027-04-15T00:00:00.000Z', isCurrent: 0 },
    ]);

    const newTerms = new Map((db.prepare(`SELECT id,name FROM terms WHERE academicYearId='y-new'`).all() as { id: string; name: string }[]).map((t) => [t.name, t.id]));
    const periods = db.prepare(`SELECT * FROM grading_periods WHERE academicYearId='y-new' ORDER BY sequence`).all() as Record<string, unknown>[];
    expect(periods.map((p) => [p.code, p.termId, p.startDate, p.maxMarks, p.passingMarks, p.weight, p.institutionId])).toEqual([
      ['P1', newTerms.get('Term 1'), '2026-09-15', 100, 50, 0.5, 'school-1'],
      ['P2', newTerms.get('Term 2'), '2026-09-15', 100, 50, 0.5, 'school-1'],
    ]);

    expect(db.prepare(`SELECT subjectId FROM class_subjects WHERE classId=?`).all(g1)).toEqual([{ subjectId: 'sub-1' }]);
    expect(db.prepare(`SELECT staffId,isClassTeacher FROM class_teachers WHERE classId=?`).all(g1)).toEqual([{ staffId: 't-on', isClassTeacher: 1 }]);
    expect(db.prepare(`SELECT staffId FROM class_subject_teachers WHERE classId=?`).all(g1)).toEqual([{ staffId: 't-on' }]);

    // The outbox saw each new row as a create (and nothing else).
    const queued = db.prepare(`SELECT entityType, COUNT(*) n FROM sync_queue WHERE operationType='create' GROUP BY entityType ORDER BY entityType`).all();
    expect(queued).toEqual([
      { entityType: 'class_subject_teachers', n: 1 },
      { entityType: 'class_subjects', n: 2 },
      { entityType: 'class_teachers', n: 1 },
      { entityType: 'classes', n: 2 },
      { entityType: 'grading_periods', n: 2 },
      { entityType: 'terms', n: 2 },
    ]);
    expect(count('sync_queue')).toBe(10);
    // Parents are queued before the rows that reference them.
    const order = (db.prepare(`SELECT entityType FROM sync_queue ORDER BY seq`).all() as { entityType: string }[]).map((r) => r.entityType);
    expect(order.indexOf('classes')).toBeLessThan(order.indexOf('class_subjects'));
    expect(order.lastIndexOf('terms')).toBeLessThan(order.indexOf('grading_periods'));
    const payload = JSON.parse((db.prepare(`SELECT payload FROM sync_queue WHERE entityType='classes' LIMIT 1`).get() as { payload: string }).payload);
    expect(payload.record).toMatchObject({ institutionId: 'school-1', academicYearId: 'y-new', isActive: 1 });
  });

  it('skips inactive classes and the assignments of inactive staff, and leaves the source alone', () => {
    const { db, service, count } = setup();
    service.copyStructure(request);
    expect(count('classes', `academicYearId='y-new' AND name='Grade 9'`)).toBe(0);
    // Grade 2 is copied, but its only teacher is inactive.
    const g2 = (db.prepare(`SELECT id FROM classes WHERE academicYearId='y-new' AND name='Grade 2'`).get() as { id: string }).id;
    expect(count('class_teachers', `classId='${g2}'`)).toBe(0);
    expect(count('class_subject_teachers', `classId='${g2}'`)).toBe(0);
    expect(count('class_subjects', `classId='${g2}'`)).toBe(1);
    // An inactive subject is not carried into the new year.
    expect(count('class_subjects', `subjectId='sub-off' AND classId IN (SELECT id FROM classes WHERE academicYearId='y-new')`)).toBe(0);
    expect(count('class_subject_teachers', `subjectId='sub-off' AND classId IN (SELECT id FROM classes WHERE academicYearId='y-new')`)).toBe(0);
    expect(count('classes', `academicYearId='y-old'`)).toBe(3);
    expect(count('terms', `academicYearId='y-old'`)).toBe(2);
  });

  it('numbers the terms by date order when the source terms lack distinct sequences', () => {
    const { db, service, run } = setup();
    run(`UPDATE sync_runtime SET captureEnabled = 0 WHERE id = 'singleton'`);
    run(`UPDATE terms SET sequence = NULL WHERE academicYearId = 'y-old'`);
    run(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`);
    service.copyStructure(request);
    expect(db.prepare(`SELECT name,sequence FROM terms WHERE academicYearId='y-new' ORDER BY sequence`).all()).toEqual([
      { name: 'Term 1', sequence: 1 },
      { name: 'Term 2', sequence: 2 },
    ]);
  });

  it('refuses a target that already has a term, writing nothing', () => {
    const { service, term, count } = setup();
    term('t-new', 'y-new', 'Term 1', 1, '2026-09-15', '2026-12-15');
    const before = count('sync_queue');
    expect(() => service.copyStructure(request)).toThrow(YearStructureNotEmptyError);
    expect(() => service.copyStructure(request)).toThrow(REFUSAL);
    expect(count('classes', `academicYearId='y-new'`)).toBe(0);
    expect(count('sync_queue')).toBe(before);
  });

  it('refuses a target that already has a class', () => {
    const { service, run, count } = setup();
    run(`INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt) VALUES ('c-x','school-1','y-new','Grade 1','GRADE_1',1,1,'u')`);
    expect(() => service.copyStructure(request)).toThrow(REFUSAL);
    expect(count('terms', `academicYearId='y-new'`)).toBe(0);
  });

  it.each(['ACTIVE', 'CLOSED', 'REOPENED'])('refuses a %s target', (status) => {
    const { service, run, count } = setup();
    run(`UPDATE sync_runtime SET captureEnabled = 0 WHERE id = 'singleton'`);
    run(`UPDATE academic_years SET status = ? WHERE id = 'y-new'`, status);
    run(`UPDATE sync_runtime SET captureEnabled = 1 WHERE id = 'singleton'`);
    expect(() => service.copyStructure(request)).toThrow(REFUSAL);
    expect(count('classes', `academicYearId='y-new'`)).toBe(0);
  });

  it('refuses a SETUP source, the same year, another school, or an unknown year', () => {
    const { service, year } = setup();
    year('y-setup2', '2027/2028', '2027-09-01', 'SETUP');
    year('y-other', 'Other', '2024-09-01', 'CLOSED', 'school-2');
    expect(() => service.copyStructure({ targetYearId: 'y-new', sourceYearId: 'y-setup2' })).toThrow(REFUSAL);
    expect(() => service.copyStructure({ targetYearId: 'y-new', sourceYearId: 'y-new' })).toThrow(REFUSAL);
    expect(() => service.copyStructure({ targetYearId: 'y-new', sourceYearId: 'y-other' })).toThrow(REFUSAL);
    expect(() => service.copyStructure({ targetYearId: 'y-new', sourceYearId: 'nope' })).toThrow(REFUSAL);
    expect(() => service.copyStructure({ targetYearId: 'y-other', sourceYearId: 'y-old' })).toThrow(REFUSAL);
  });

  it('is for a school administrator only', () => {
    const { service } = setup({ ...admin, role: SystemRole.TEACHER });
    expect(() => service.copyStructure(request)).toThrow(ForbiddenError);
  });
});
