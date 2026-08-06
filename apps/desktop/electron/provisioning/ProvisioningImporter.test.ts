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
