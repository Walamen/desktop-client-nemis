import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PROVISIONING_COLLECTIONS,
  type ProvisioningData,
  type ProvisioningRow,
  type ProvisioningSnapshot,
} from '@nemis-desktop/types';
import { DatabaseManager } from '@app/database/DatabaseManager';
import { ProvisioningImporter } from './ProvisioningImporter';

describe('ProvisioningImporter', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-provisioning-'));
    manager = new DatabaseManager({
      userDataDir: directory,
      device: { deviceName: 'PC', platform: 'win32', osVersion: '11', appVersion: '1.0.0' },
    });
    manager.initialize();
  });
  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('atomically imports, verifies, and records completion', () => {
    const importer = new ProvisioningImporter(manager);
    const snapshot = makeSnapshot();
    importer.import(snapshot, {
      institutionId: 'school-1',
      userId: 'user-1',
      role: 'INSTITUTION_ADMIN',
      scopeType: 'INSTITUTION',
      scopeId: 'school-1',
      serverDeviceId: 'server-device-1',
    });
    expect(importer.getCompletion()).toMatchObject({
      institutionId: 'school-1',
      userId: 'user-1',
    });
    expect(
      (manager.connection.prepare('SELECT COUNT(*) count FROM institutions').get() as { count: number }).count,
    ).toBe(1);
  });

  it('rejects corruption without replacing existing school data', () => {
    const importer = new ProvisioningImporter(manager);
    const snapshot = makeSnapshot();
    importer.import(snapshot, {
      institutionId: 'school-1',
      userId: 'user-1',
      role: 'INSTITUTION_ADMIN',
      scopeType: 'INSTITUTION',
      scopeId: 'school-1',
      serverDeviceId: 'server-device-1',
    });
    const corrupt = { ...snapshot, checksum: '0'.repeat(64) };
    expect(() =>
      importer.import(corrupt, {
        institutionId: 'school-1',
        userId: 'user-1',
        role: 'INSTITUTION_ADMIN',
        scopeType: 'INSTITUTION',
        scopeId: 'school-1',
        serverDeviceId: 'server-device-1',
      }),
    ).toThrow(/checksum/i);
    expect(
      (manager.connection.prepare('SELECT name FROM institutions WHERE id=?').get('school-1') as { name: string }).name,
    ).toBe('Central High');
  });

  it('merge mode upserts without deleting rows the snapshot omits', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf({ ...BASE_DATA, students: [student('s1', 'Ada')] }), CONTEXT);
    expect(countRows('students')).toBe(1);

    // A legitimately-empty delta: nothing changed on the server since the last
    // pull, so every collection (and every manifest count) is 0. Under the old
    // delete-everything import this wiped the whole local database.
    importer.import(snapshotOf({}), CONTEXT, { merge: true });

    expect(countRows('students')).toBe(1);
    expect(countRows('institutions')).toBe(1);
    expect(countRows('users')).toBe(1);
  });

  it('merge mode upserts a row that changed without touching rows absent from the delta', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(
      snapshotOf({ ...BASE_DATA, students: [student('s1', 'Ada'), student('s2', 'Grace')] }),
      CONTEXT,
    );

    // Delta: student s1 changed, s2 did not and is therefore absent.
    importer.import(
      snapshotOf({ ...BASE_DATA, students: [student('s1', 'Adaeze')] }),
      CONTEXT,
      { merge: true },
    );

    expect(
      manager.connection.prepare('SELECT id,firstName FROM students ORDER BY id').all(),
    ).toEqual([
      { id: 's1', firstName: 'Adaeze' },
      { id: 's2', firstName: 'Grace' },
    ]);
  });

  it('keeps the error history of dead-lettered operations across a successful import', () => {
    const importer = new ProvisioningImporter(manager);
    const at = '2026-07-29T00:00:00.000Z';
    // A dead-lettered operation survives the import; the reason string the
    // conflicts UI shows for it is built from its sync_errors row, so that row
    // has to survive too.
    seedQueueItem('op-dead', 'failed', 1);
    seedError('err-dead', 'op-dead');
    // A completed operation's error history is transient and must still be
    // cleared along with the operation itself.
    seedQueueItem('op-done', 'completed', 0);
    seedError('err-done', 'op-done');

    importer.import(makeSnapshot(), CONTEXT, { preserveConflicts: true });

    expect(manager.connection.prepare('SELECT id FROM sync_errors ORDER BY id').all()).toEqual([
      { id: 'err-dead' },
    ]);

    function seedQueueItem(id: string, status: string, deadLetter: number): void {
      manager.connection.prepare(`
        INSERT INTO sync_queue
          (id,entityType,entityId,operationType,payload,retryCount,status,deadLetter,createdAt,updatedAt)
        VALUES (?,'students','s1','create',NULL,5,?,?,?,?)
      `).run(id, status, deadLetter, at, at);
    }
    function seedError(id: string, operationId: string): void {
      manager.connection.prepare(`
        INSERT INTO sync_errors (id,operationId,message,stack,retryCount,createdAt)
        VALUES (?,?,'server rejected permanently',NULL,5,?)
      `).run(id, operationId, at);
    }
  });

  it('a failed delta merge records the error without disabling all future sync', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf({ ...BASE_DATA, students: [student('s1', 'Ada')] }), CONTEXT);
    expect(readProvisioningMetadata().status).toBe('complete');

    // Merge mode deliberately never deletes rows the delta omits (a delta
    // cannot express server-side deletions; the 24h full resync is the safety
    // net). So a stale local row the server has already superseded can collide
    // with an incoming row on a SECONDARY unique constraint —
    // idx_students_admission is UNIQUE(institutionId, admissionNumber), which
    // the ON CONFLICT(id) upsert does not absorb.
    expect(() =>
      importer.import(
        snapshotOf({ students: [{ ...student('s2', 'Grace'), admissionNumber: 'ADM-s1' }] }),
        CONTEXT,
        { merge: true },
      ),
    ).toThrow(/UNIQUE/i);

    // status must still be 'complete'. DesktopSyncWorker.syncActive() proceeds
    // only while it reads 'complete', and nothing flips it back automatically,
    // so 'failed' (or 'in_progress') here would permanently disable every
    // future sync cycle — including the 24h full resync that would clear the
    // stale colliding row — leaving manual re-provisioning (which wipes the
    // unsynced queue) as the only way out.
    const metadata = readProvisioningMetadata();
    expect(metadata.status).toBe('complete');
    expect(metadata.lastError).toMatch(/UNIQUE/i);
  });

  it('self-heals a class_teachers row reassigned under a new id on delta merge, instead of colliding on the (classId,staffId) unique index', () => {
    // Unlike students.admissionNumber above, class_teachers has no
    // "legitimately still colliding, wait for the 24h resync" case: the
    // server sends this whole collection in full on every pull (no
    // updatedAt column to delta-filter on), so an incoming row's
    // (classId,staffId) pair IS the complete current truth, not a partial
    // delta. A school admin unassigning then reassigning the same teacher
    // mints a brand-new server-side id for the same pair (Prisma
    // classTeacher.create() default), which must replace the stale local
    // row, not collide with it.
    const importer = new ProvisioningImporter(manager);
    importer.import(
      snapshotOf({
        ...TEACHER_FIXTURE_DATA,
        classTeachers: [classTeacherRow('ct-1', 'class-1', 'staff-1')],
      }),
      CONTEXT,
    );
    expect(countRows('class_teachers')).toBe(1);

    expect(() =>
      importer.import(
        snapshotOf({ classTeachers: [classTeacherRow('ct-2', 'class-1', 'staff-1')] }),
        CONTEXT,
        { merge: true },
      ),
    ).not.toThrow();

    expect(manager.connection.prepare('SELECT id FROM class_teachers').all()).toEqual([
      { id: 'ct-2' },
    ]);
  });

  it('prunes a class_teachers row genuinely unassigned server-side (no successor row) on delta merge', () => {
    // The bug this covers: a school admin unassigns a teacher on the web
    // portal with no reassignment. The next delta merge's classTeachers
    // array (always the full current truth for this scope, per
    // desktop-provisioning.service.ts) simply omits the pair — there is no
    // successor row to trigger the id-collision self-heal above. Without an
    // explicit prune, "merge never deletes rows the delta omits" left this
    // row stranded locally forever, so the teacher's desktop kept showing a
    // class they'd been removed from until the 24h full resync.
    const importer = new ProvisioningImporter(manager);
    importer.import(
      snapshotOf({
        ...TEACHER_FIXTURE_DATA,
        classTeachers: [classTeacherRow('ct-1', 'class-1', 'staff-1')],
      }),
      CONTEXT,
    );
    expect(countRows('class_teachers')).toBe(1);

    importer.import(snapshotOf({}), CONTEXT, { merge: true });

    expect(countRows('class_teachers')).toBe(0);
  });

  it('does not prune a locally-pending class_teachers row the delta says nothing about (not yet pushed)', () => {
    // Mirrors the assignments "does not touch a locally-created assignment"
    // guarantee: an INSTITUTION_ADMIN device can assign/remove a teacher
    // offline (SqliteTeacherRepository.assign/removeAssignment), and that
    // local write cannot be in any snapshot the server sends until it's been
    // pushed — pruning it on the next pull would silently lose the admin's
    // offline change.
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf(TEACHER_FIXTURE_DATA), CONTEXT);

    // Simulates the local write path: captureEnabled is 1 outside of
    // import(), so this insert fires the real outbox trigger (migration
    // 010), leaving a genuine 'pending' sync_queue row behind — the same
    // signal SqliteTeacherRepository.assign() would produce.
    manager.connection.prepare(`
      INSERT INTO class_teachers (id,classId,staffId,isClassTeacher,assignedAt,updatedAt)
      VALUES ('local-ct-1','class-1','staff-2',0,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')
    `).run();
    expect(
      (manager.connection.prepare(
        `SELECT COUNT(*) count FROM sync_queue WHERE entityType='class_teachers' AND entityId='local-ct-1' AND status='pending'`,
      ).get() as { count: number }).count,
    ).toBe(1);

    // A delta pull that says nothing about class-1/staff-2 — the server has
    // never seen this device's offline assignment yet.
    importer.import(snapshotOf({}), CONTEXT, { merge: true });

    expect(countRows('class_teachers')).toBe(1);
  });

  it('self-heals a subject_teachers row reassigned under a new id on delta merge', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(
      snapshotOf({
        ...TEACHER_FIXTURE_DATA,
        subjectTeachers: [subjectTeacherRow('st-1', 'subject-1', 'staff-1')],
      }),
      CONTEXT,
    );
    expect(countRows('subject_teachers')).toBe(1);

    expect(() =>
      importer.import(
        snapshotOf({ subjectTeachers: [subjectTeacherRow('st-2', 'subject-1', 'staff-1')] }),
        CONTEXT,
        { merge: true },
      ),
    ).not.toThrow();

    expect(manager.connection.prepare('SELECT id FROM subject_teachers').all()).toEqual([
      { id: 'st-2' },
    ]);
  });

  it('self-heals a class_subject_teachers row reassigned under a new id on delta merge', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(
      snapshotOf({
        ...TEACHER_FIXTURE_DATA,
        classSubjectTeachers: [classSubjectTeacherRow('cst-1', 'class-1', 'subject-1', 'staff-1')],
      }),
      CONTEXT,
    );
    expect(countRows('class_subject_teachers')).toBe(1);

    expect(() =>
      importer.import(
        snapshotOf({
          classSubjectTeachers: [classSubjectTeacherRow('cst-2', 'class-1', 'subject-1', 'staff-2')],
        }),
        CONTEXT,
        { merge: true },
      ),
    ).not.toThrow();

    expect(manager.connection.prepare('SELECT id FROM class_subject_teachers').all()).toEqual([
      { id: 'cst-2' },
    ]);
  });

  it('imports assessments referencing a grading period without an FK violation, both on first import and on re-provisioning', () => {
    // PROVISIONING_COLLECTIONS must insert assessments AFTER gradingPeriods
    // (assessments.gradingPeriodId REFERENCES grading_periods(id)) and delete
    // them in the exact reverse order, so grading_periods must be deleted
    // AFTER assessments too. Importing twice exercises both directions.
    const importer = new ProvisioningImporter(manager);
    const snapshot = snapshotOf(ASSESSMENT_FK_DATA);

    expect(() => importer.import(snapshot, CONTEXT)).not.toThrow();
    expect(countRows('grading_periods')).toBe(1);
    expect(countRows('assessments')).toBe(1);

    // Re-provisioning: deletes everything (in reverse collection order) and
    // re-inserts. This is where the delete-order half of the bug bit.
    expect(() => importer.import(snapshot, CONTEXT)).not.toThrow();
    expect(countRows('grading_periods')).toBe(1);
    expect(countRows('assessments')).toBe(1);
  });

  it('a failed full import still marks provisioning failed', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(makeSnapshot(), CONTEXT);
    expect(readProvisioningMetadata().status).toBe('complete');

    // The same secondary-unique collision, but within one full snapshot: a full
    // import is user-driven and re-runnable from the UI, so 'failed' remains
    // the correct terminal state for it.
    expect(() =>
      importer.import(
        snapshotOf({
          ...BASE_DATA,
          students: [student('s1', 'Ada'), { ...student('s2', 'Grace'), admissionNumber: 'ADM-s1' }],
        }),
        CONTEXT,
      ),
    ).toThrow(/UNIQUE/i);

    const metadata = readProvisioningMetadata();
    expect(metadata.status).toBe('failed');
    expect(metadata.lastError).toMatch(/UNIQUE/i);
  });

  it('marks a pulled assignment as already-synced, so it is not re-pushed as a duplicate', () => {
    // A web-created (or otherwise not-yet-seen-by-this-device) assignment
    // arrives with no local remoteId/syncedAt bookkeeping — those columns are
    // desktop-only and never sent by the server. Without this,
    // AssignmentSyncService.pushPending() would treat it as never-pushed and
    // create a duplicate on the server every sync cycle.
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf({ ...BASE_DATA, assignments: [assignment('a1')] }), CONTEXT);

    const row = manager.connection
      .prepare('SELECT remoteId, syncedAt FROM assignments WHERE id=?')
      .get('a1') as { remoteId: string | null; syncedAt: string | null };
    expect(row.remoteId).toBe('a1');
    expect(row.syncedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not touch a locally-created assignment the snapshot never mentions (still pending its first push)', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf(BASE_DATA), CONTEXT);
    // Simulates AssignmentSyncService.pushPending() inserting a row this
    // device created offline, before it has ever been pushed.
    manager.connection.prepare(`
      INSERT INTO assignments (id,classId,subjectId,teacherId,title,type,status,dueDate,createdAt,updatedAt,remoteId,syncedAt)
      VALUES ('local-1','class-1',NULL,'staff-1','Local homework','HOMEWORK','DRAFT','2026-02-01',?,?,NULL,NULL)
    `).run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    // A later delta pull that says nothing about this assignment — the
    // server has never seen it, so it cannot appear in the snapshot.
    importer.import(snapshotOf(BASE_DATA), CONTEXT, { merge: true });

    const row = manager.connection
      .prepare('SELECT remoteId FROM assignments WHERE id=?')
      .get('local-1') as { remoteId: string | null };
    expect(row.remoteId).toBeNull();
  });

  it('imports districts and links institutions to them', () => {
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf(DISTRICT_FK_DATA), CONTEXT);
    expect(countRows('districts')).toBe(1);
    expect(
      (manager.connection.prepare('SELECT districtId FROM institutions WHERE id=?').get('school-1') as { districtId: string }).districtId,
    ).toBe('district-1');
  });

  it('tolerates a snapshot missing a collection entirely (e.g. desktop shipped ahead of backend), treating it as empty rather than failing the whole import', () => {
    const importer = new ProvisioningImporter(manager);
    const base = snapshotOf(BASE_DATA);
    // 'districts' is absent from both data and manifest, not merely empty —
    // simulating a backend response that predates the collection entirely.
    const data = { ...base.data } as Record<string, unknown>;
    delete data.districts;
    const manifest = { ...base.manifest } as Record<string, unknown>;
    delete manifest.districts;
    const snapshot = {
      ...base,
      data,
      manifest,
      checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    } as unknown as ProvisioningSnapshot;

    expect(() => importer.import(snapshot, CONTEXT)).not.toThrow();
    expect(countRows('districts')).toBe(0);
    expect(countRows('institutions')).toBe(1);
  });

  it('does not enforce the institutions.districtId -> districts dependency during a delta merge, per the design spec fallback', () => {
    // The districts table can legitimately be an incomplete subset (or, per
    // the missing-collection fix above, empty) during a delta merge — full
    // enforcement only holds when a full resync guarantees districts is
    // complete. The mapper falls back to '—' for the district name rather
    // than throwing, so the importer must not throw here either.
    const importer = new ProvisioningImporter(manager);
    importer.import(snapshotOf(BASE_DATA), CONTEXT);
    expect(() =>
      importer.import(
        snapshotOf({ institutions: [{ ...BASE_DATA.institutions![0], districtId: 'ghost-district' }] }),
        CONTEXT,
        { merge: true },
      ),
    ).not.toThrow();
    expect(
      (manager.connection.prepare('SELECT districtId FROM institutions WHERE id=?').get('school-1') as { districtId: string }).districtId,
    ).toBe('ghost-district');
  });

  it('still enforces the institutions.districtId -> districts dependency during a full (non-merge) resync', () => {
    // Full resyncs guarantee the districts table is complete, so a dangling
    // districtId there is real corruption and must still fail loudly.
    const importer = new ProvisioningImporter(manager);
    expect(() =>
      importer.import(
        snapshotOf({ institutions: [{ ...BASE_DATA.institutions![0], districtId: 'ghost-district' }] }),
        CONTEXT,
      ),
    ).toThrow(/Missing dependency institutions\.districtId/);
  });

  function countRows(table: string): number {
    return (manager.connection.prepare(`SELECT COUNT(*) count FROM ${table}`).get() as { count: number }).count;
  }

  function readProvisioningMetadata(): { status: string; lastError: string | null } {
    return manager.connection
      .prepare(`SELECT status,lastError FROM provisioning_metadata WHERE id='singleton'`)
      .get() as { status: string; lastError: string | null };
  }
});

const CONTEXT = {
  institutionId: 'school-1',
  userId: 'user-1',
  role: 'INSTITUTION_ADMIN',
  scopeType: 'INSTITUTION',
  scopeId: 'school-1',
  serverDeviceId: 'server-device-1',
};

function student(id: string, firstName: string): ProvisioningRow {
  return {
    id,
    institutionId: 'school-1',
    firstName,
    middleName: null,
    lastName: 'Learner',
    admissionNumber: `ADM-${id}`,
    dateOfBirth: '2012-05-04',
    gender: 'FEMALE',
    gradeLevel: 'GRADE_7',
    isActive: true,
    admissionDate: '2026-01-05',
    phoneNumber: null,
    email: null,
    address: null,
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastModifiedBy: null,
  };
}

function assignment(id: string, classId = 'class-1'): ProvisioningRow {
  return {
    id, classId, subjectId: null, teacherId: 'staff-1',
    title: 'Chapter 5', type: 'HOMEWORK', status: 'PUBLISHED',
    description: null, instructions: null, dueDate: '2026-02-01',
    totalMarks: null, attachmentUrl: null, attachmentName: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeSnapshot(): ProvisioningSnapshot {
  return snapshotOf(BASE_DATA);
}

/** Builds a valid, checksum-consistent snapshot envelope around `overrides`;
 * every collection the caller omits is empty (and its manifest count 0), which
 * is exactly the shape of a real delta snapshot. */
function snapshotOf(overrides: Partial<ProvisioningData>): ProvisioningSnapshot {
  const empty = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, []])) as unknown as ProvisioningData;
  const data: ProvisioningData = { ...empty, ...overrides };
  const manifest = Object.fromEntries(
    PROVISIONING_COLLECTIONS.map((key) => [key, data[key].length]),
  ) as ProvisioningSnapshot['manifest'];
  return {
    contractVersion: 1,
    snapshotId: 'snapshot-1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    userId: 'user-1',
    role: 'INSTITUTION_ADMIN',
    scopeType: 'INSTITUTION',
    scopeId: 'school-1',
    institutionId: 'school-1',
    deviceId: 'server-device-1',
    checksumAlgorithm: 'sha256',
    checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    manifest,
    data,
  };
}

const BASE_DATA: Partial<ProvisioningData> = {
  institutions: [{
    id: 'school-1', code: 'SCH-1', name: 'Central High', type: 'SECONDARY',
    ownership: 'PUBLIC', countyId: 'county-1', districtId: null,
    approvalStatus: 'APPROVED', street: null, communityTown: null,
    latitude: null, longitude: null, rejectionReason: null, profile: null,
    version: 1, updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: null,
  }],
  users: [{
    id: 'user-1', firstName: 'School', middleName: null, lastName: 'Admin',
    email: 'admin@school.edu', isActive: true, version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: null,
  }],
  userOrganizations: [{
    id: 'org-1', userId: 'user-1', role: 'INSTITUTION_ADMIN',
    institutionId: 'school-1', countyId: 'county-1', districtId: null, isActive: true,
  }],
};

/** BASE_DATA plus a class/subject/gradingPeriod/assessmentTemplate/assessment
 * chain, exercising assessments.gradingPeriodId -> grading_periods(id) (the
 * real SQLite FK added in migration 017) and the corresponding
 * verifyDatabase dependency check. */
const ASSESSMENT_FK_DATA: Partial<ProvisioningData> = {
  ...BASE_DATA,
  academicYears: [{
    id: 'ay-1', institutionId: 'school-1', code: '2026',
    startDate: '2026-01-01', endDate: '2026-12-31', isCurrent: true,
    status: 'ACTIVE', version: 1, updatedAt: '2026-01-01T00:00:00.000Z',
    lastModifiedBy: null,
  }],
  classes: [{
    id: 'class-1', institutionId: 'school-1', academicYearId: 'ay-1',
    name: 'Grade 7A', gradeLevel: 'GRADE_7', capacity: 30, isActive: true,
    section: 'A', version: 1, updatedAt: '2026-01-01T00:00:00.000Z',
    lastModifiedBy: null,
  }],
  subjects: [{
    id: 'subject-1', institutionId: 'school-1', name: 'Mathematics',
    code: 'MATH', description: null, isActive: true, version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: null,
  }],
  gradingPeriods: [{
    id: 'gp-1', institutionId: 'school-1', academicYearId: 'ay-1',
    termId: 'term-1', name: 'Term 1', code: 'T1', periodType: 'TERM',
    sequence: 1, maxMarks: 100, passingMarks: 50, weight: 1,
    startDate: '2026-01-01', endDate: '2026-04-01', isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }],
  assessmentTemplates: [{
    id: 'tmpl-1', classId: 'class-1', subjectId: 'subject-1', name: 'CAT 1',
    type: 'TEST', totalMarks: 30, weight: 30, date: '2026-01-15',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }],
  assessments: [{
    id: 'assess-1', templateId: 'tmpl-1', classId: 'class-1', subjectId: 'subject-1',
    gradingPeriodId: 'gp-1', name: 'CAT 1', type: 'TEST', totalMarks: 30,
    weight: 30, date: '2026-01-15', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }],
};

/** BASE_DATA plus an academicYear/class/subject/staff chain, enough to
 * satisfy class_teachers/subject_teachers/class_subject_teachers' real
 * SQLite foreign keys (classId -> classes, subjectId -> subjects,
 * staffId -> staff), so the self-heal tests can focus purely on the
 * natural-key reconciliation behaviour. */
const TEACHER_FIXTURE_DATA: Partial<ProvisioningData> = {
  ...BASE_DATA,
  academicYears: [{
    id: 'ay-1', institutionId: 'school-1', code: '2026',
    startDate: '2026-01-01', endDate: '2026-12-31', isCurrent: true,
    status: 'ACTIVE', version: 1, updatedAt: '2026-01-01T00:00:00.000Z',
    lastModifiedBy: null,
  }],
  classes: [{
    id: 'class-1', institutionId: 'school-1', academicYearId: 'ay-1',
    name: 'Grade 7A', gradeLevel: 'GRADE_7', capacity: 30, isActive: true,
    section: 'A', version: 1, updatedAt: '2026-01-01T00:00:00.000Z',
    lastModifiedBy: null,
  }],
  subjects: [{
    id: 'subject-1', institutionId: 'school-1', name: 'Mathematics',
    code: 'MATH', description: null, isActive: true, version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: null,
  }],
  staff: [staffMember('staff-1'), staffMember('staff-2')],
};

function staffMember(id: string): ProvisioningRow {
  return {
    id, institutionId: 'school-1', userId: null, firstName: 'Teach',
    lastName: id, middleName: null, dateOfBirth: '1990-01-01', gender: 'FEMALE',
    nationalId: null, phoneNumber: '0770000000', email: null, address: null,
    employeeNumber: `EMP-${id}`, position: 'Teacher', employmentType: 'FULL_TIME',
    dateOfJoining: '2020-01-01', dateOfLeaving: null, qualifications: null,
    isActive: true, photoUrl: null, approvalStatus: 'APPROVED', approvedBy: null,
    approvedAt: null, approvalNotes: null, createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', version: 1, lastModifiedBy: null,
  };
}

function classTeacherRow(id: string, classId: string, staffId: string): ProvisioningRow {
  return {
    id, classId, staffId, isClassTeacher: false,
    assignedAt: '2026-01-01T00:00:00.000Z', version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: null,
  };
}

function subjectTeacherRow(id: string, subjectId: string, staffId: string): ProvisioningRow {
  return {
    id, subjectId, staffId,
    assignedAt: '2026-01-01T00:00:00.000Z', version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: null,
  };
}

function classSubjectTeacherRow(
  id: string, classId: string, subjectId: string, staffId: string,
): ProvisioningRow {
  return {
    id, classId, subjectId, staffId,
    assignedAt: '2026-01-01T00:00:00.000Z', version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z', lastModifiedBy: null,
  };
}

const DISTRICT_FK_DATA: Partial<ProvisioningData> = {
  ...BASE_DATA,
  districts: [{ id: 'district-1', name: 'Sinkor District', countyId: 'county-1' }],
  institutions: [{ ...BASE_DATA.institutions![0], districtId: 'district-1' }],
};
