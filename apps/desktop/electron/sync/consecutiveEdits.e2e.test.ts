import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopScopeType,
  PROVISIONING_COLLECTIONS,
  SystemRole,
  type DesktopSyncOperation,
  type DesktopSyncOperationResult,
  type ProvisioningUser,
} from '@nemis-desktop/types';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { SchoolAdminModuleService } from '../data/services/SchoolAdminModuleService';
import type { BackendProvisioningGateway } from '../provisioning/BackendProvisioningGateway';
import { DesktopSyncWorker } from './DesktopSyncWorker';

/**
 * End-to-end: offline edits made through the same service the renderer uses,
 * pushed by the real worker against a fake server that applies the real
 * concurrency rule (Nemis `mutationDecision`). Spec 2026-11-05 sections 1 and 7.
 */

const ADMIN: ProvisioningUser = {
  id: 'user-1',
  email: 'admin@example.test',
  firstName: 'School',
  lastName: 'Admin',
  role: SystemRole.INSTITUTION_ADMIN,
  institutionId: 'school-1',
  scope: { type: DesktopScopeType.INSTITUTION, scopeId: 'school-1', institutionId: 'school-1' },
};

const STALE_REASON = 'The server record changed after the offline edit began.';
const TOKEN_FIELDS = ['updatedAt', 'assignedAt', 'createdAt'] as const;

type Row = Record<string, unknown>;

function time(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * In-memory server. Its clock starts far from the desktop's so a test can tell
 * a server-issued token from a desktop timestamp at a glance.
 */
class FakeApplierServer {
  readonly rows = new Map<string, Row>();
  readonly batches: DesktopSyncOperation[][] = [];
  #clock = Date.parse('2030-01-01T00:00:00.000Z');

  #tick(): string {
    this.#clock += 1000;
    return new Date(this.#clock).toISOString();
  }

  row(entityType: string, id: string): Row | undefined {
    return this.rows.get(`${entityType}/${id}`);
  }

  /** Someone changed the record on the web: new values and a newer token. */
  editOnWeb(entityType: string, id: string, changes: Row): void {
    const stored = this.row(entityType, id);
    if (!stored) throw new Error(`No server row ${entityType}/${id}`);
    this.rows.set(`${entityType}/${id}`, { ...stored, ...changes, updatedAt: this.#tick() });
  }

  /** The next batch is applied, but its acknowledgement never reaches the
   * desktop: the push throws this message instead. */
  loseNextAcknowledgement: string | null = null;

  /** Like the real server: an operationId it has already applied gets its
   * stored receipt back, and the payload sent with it is not applied. */
  replayReceipts = false;
  readonly #receipts = new Map<string, DesktopSyncOperationResult>();

  push(operations: DesktopSyncOperation[]): { processedAt: string; results: DesktopSyncOperationResult[] } {
    this.batches.push(operations);
    const results = operations.map((operation) => {
      const stored = this.replayReceipts ? this.#receipts.get(operation.operationId) : undefined;
      if (stored) return stored;
      const result = this.#apply(operation);
      this.#receipts.set(operation.operationId, result);
      return result;
    });
    if (this.loseNextAcknowledgement) {
      const message = this.loseNextAcknowledgement;
      this.loseNextAcknowledgement = null;
      throw new Error(message);
    }
    return { processedAt: new Date(this.#clock).toISOString(), results };
  }

  #apply(operation: DesktopSyncOperation): DesktopSyncOperationResult {
    const { operationId, entityType, entityId, operationType } = operation;
    const key = `${entityType}/${entityId}`;
    const payload = (typeof operation.payload === 'string' ? JSON.parse(operation.payload) : operation.payload) as {
      base?: Row;
      record?: Row;
    };
    const stored = this.rows.get(key);
    const refuse = (reason: string): DesktopSyncOperationResult => ({
      operationId,
      entityType,
      entityId,
      status: 'conflict',
      reason,
      remotePayload: stored ?? null,
    });

    if (operationType === 'create' && stored) return refuse('A server record already exists with this identifier.');
    if (operationType !== 'create' && !stored) return refuse('The server record does not exist.');
    if (operationType !== 'create' && stored) {
      const base = payload.base ?? {};
      const field = TOKEN_FIELDS.find((name) => time(base[name]) !== null && time(stored[name]) !== null);
      if (field && time(base[field]) !== time(stored[field])) return refuse(STALE_REASON);
    }

    if (operationType === 'delete') {
      this.rows.delete(key);
      return { operationId, entityType, entityId, status: 'accepted' };
    }
    const updatedAt = this.#tick();
    this.rows.set(key, {
      ...toServerShape(payload.record ?? {}),
      id: entityId,
      createdAt: stored?.createdAt ?? updatedAt,
      updatedAt,
    });
    return { operationId, entityType, entityId, status: 'accepted', serverToken: { field: 'updatedAt', value: updatedAt } };
  }
}

/** How Postgres hands these columns back: real lists and booleans, not SQLite text/0-1. */
function toServerShape(record: Row): Row {
  const shaped: Row = { ...record };
  if (typeof shaped.allowedRoles === 'string') shaped.allowedRoles = JSON.parse(shaped.allowedRoles) as unknown;
  if (shaped.isPublished === 0 || shaped.isPublished === 1) shaped.isPublished = shaped.isPublished === 1;
  return shaped;
}

function emptySnapshot() {
  const data = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, []]));
  return {
    contractVersion: 1,
    snapshotId: 'snap-e2e',
    generatedAt: '2030-06-01T00:00:00.000Z',
    userId: 'user-1',
    role: 'INSTITUTION_ADMIN',
    scopeType: 'INSTITUTION',
    scopeId: 'school-1',
    institutionId: 'school-1',
    deviceId: 'device-1',
    checksumAlgorithm: 'sha256',
    checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    manifest: Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, 0])),
    data,
  };
}

describe('consecutive offline edits, end to end', () => {
  let directory: string;
  let workspaces: WorkspaceManager;
  let service: SchoolAdminModuleService;
  let server: FakeApplierServer;
  let worker: DesktopSyncWorker;

  const db = () => workspaces.active.database.connection;
  const now = () => new Date().toISOString();

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-consecutive-edits-'));
    workspaces = new WorkspaceManager({
      userDataDir: directory,
      masterKey: 'ab'.repeat(32),
      device: { deviceName: 'e2e', platform: 'win32', osVersion: '11', appVersion: '1' },
      log: { info() {}, warn() {}, error() {} },
    });
    workspaces.activate(ADMIN);
    const at = '2026-11-01T00:00:00.000Z';
    db().transaction(() => {
      db().prepare(`UPDATE sync_runtime SET captureEnabled=0 WHERE id='singleton'`).run();
      db().prepare(`
        INSERT INTO provisioning_metadata (id,status,institutionId,userId,serverDeviceId,startedAt,updatedAt)
        VALUES ('singleton','complete','school-1','user-1','device-1',?,?)
      `).run(at, at);
      // A delta pull (not a full resync, which would reload every table from
      // the empty snapshot) once the queue drains.
      db().prepare(`UPDATE sync_metadata SET lastDeltaAt=?, lastFullResyncAt=? WHERE id='singleton'`).run(now(), now());
      db().prepare(`
        INSERT INTO institutions (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
        VALUES ('school-1','ONE','One','SECONDARY','PUBLIC','county-1','APPROVED',1,?)
      `).run(at);
      db().prepare(`
        INSERT INTO academic_years (id,institutionId,code,startDate,endDate,isCurrent,version,updatedAt,status)
        VALUES ('year-1','school-1','2026-2027','2026-09-01','2027-07-31',1,1,?,'ACTIVE')
      `).run(at);
      db().prepare(`
        INSERT INTO terms (id,academicYearId,name,startDate,endDate,isCurrent,version,updatedAt,sequence)
        VALUES ('term-1','year-1','Term 1','2026-09-01','2026-12-15',1,1,?,1)
      `).run(at);
      db().prepare(`
        INSERT INTO grading_periods
          (id,institutionId,academicYearId,termId,name,code,periodType,sequence,maxMarks,passingMarks,
           weight,startDate,endDate,isActive,createdAt,updatedAt)
        VALUES ('period-1','school-1','year-1','term-1','Period 1','P1','PERIOD',1,100,50,
                NULL,'2026-09-01','2026-10-15',1,?,?)
      `).run(at, at);
      db().prepare(`
        INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,isActive,version,updatedAt)
        VALUES ('class-1','school-1','year-1','Grade 7A','GRADE_7',1,1,?)
      `).run(at);
      db().prepare(`
        INSERT INTO subjects (id,institutionId,name,code,isActive,version,updatedAt)
        VALUES ('subject-1','school-1','Mathematics','MATH',1,1,?)
      `).run(at);
      for (const id of ['student-1', 'student-2']) {
        db().prepare(`
          INSERT INTO students (id,institutionId,firstName,lastName,dateOfBirth,gender,isActive,version,updatedAt)
          VALUES (?,'school-1','Ada',?,'2014-01-01','FEMALE',1,1,?)
        `).run(id, id, at);
      }
      db().prepare(`UPDATE sync_runtime SET captureEnabled=1 WHERE id='singleton'`).run();
    })();

    service = new SchoolAdminModuleService(workspaces);
    server = new FakeApplierServer();
    const gateway = {
      pushChanges: vi.fn(async (_device: string, operations: DesktopSyncOperation[]) => server.push(operations)),
      downloadSnapshot: vi.fn(async () => emptySnapshot()),
    } as unknown as BackendProvisioningGateway;
    worker = new DesktopSyncWorker(workspaces, gateway, { isOnline: () => true });
  });

  afterEach(() => {
    workspaces.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function conflicts(): { entityType: string; entityId: string; status: string; reason: string; id: string }[] {
    return db().prepare(`SELECT id,entityType,entityId,status,reason FROM sync_conflicts`).all() as never;
  }

  function unsentQueue(): number {
    return (db().prepare(`SELECT COUNT(*) n FROM sync_queue WHERE status <> 'completed'`).get() as { n: number }).n;
  }

  function createWindow(): string {
    const saved = service.save({
      collection: 'grade_entry_windows',
      record: {
        gradingPeriodId: 'period-1',
        name: 'Period 1 entry',
        description: null,
        openDate: '2026-10-01',
        closeDate: '2026-10-20',
        status: 'DRAFT',
        allowedRoles: JSON.stringify(['TEACHER']),
      },
    });
    return String(saved.id);
  }

  function transition(id: string, changes: Record<string, string>): void {
    service.save({ collection: 'grade_entry_windows', record: { id, ...changes } });
  }

  it('grade window create → open → close → publish offline syncs with zero conflicts and ends PUBLISHED', async () => {
    const id = createWindow();
    transition(id, { status: 'OPEN', openedAt: now() });
    transition(id, { status: 'CLOSED', closedAt: now() });
    transition(id, { status: 'PUBLISHED', publishedAt: now() });

    await worker.syncActive();

    expect(conflicts()).toEqual([]);
    expect(unsentQueue()).toBe(0);
    const stored = server.row('grade_entry_windows', id);
    expect(stored?.status).toBe('PUBLISHED');
    expect(stored?.allowedRoles).toEqual(['TEACHER']);
    // One change per record per batch: the create first, the merged edit after.
    expect(server.batches.map((batch) => batch.map((op) => op.operationType))).toEqual([['create'], ['update']]);
    const local = db().prepare(`SELECT status, updatedAt FROM grade_entry_windows WHERE id=?`).get(id) as {
      status: string;
      updatedAt: string;
    };
    expect(local).toEqual({ status: 'PUBLISHED', updatedAt: stored?.updatedAt });
  });

  it('grades saved then sent to students in one go sync with zero conflicts', async () => {
    const gradeIds = ['student-1', 'student-2'].map((studentId, index) =>
      String(
        service.save({
          collection: 'grades',
          record: {
            studentId,
            subjectId: 'subject-1',
            classId: 'class-1',
            gradingPeriodId: 'period-1',
            assessmentId: null,
            marksObtained: 70 + index,
            maxMarks: 100,
            percentage: 70 + index,
            letterGrade: 'B',
            isPublished: false,
            status: 'SUBMITTED',
          },
        }).id,
      ),
    );
    for (const id of gradeIds) {
      service.save({
        collection: 'grades',
        record: { id, isPublished: true, status: 'PUBLISHED', publishedAt: now() },
      });
    }

    await worker.syncActive();

    expect(conflicts()).toEqual([]);
    expect(unsentQueue()).toBe(0);
    for (const [index, id] of gradeIds.entries()) {
      expect(server.row('grades', id)).toMatchObject({
        status: 'PUBLISHED',
        isPublished: true,
        marksObtained: 70 + index,
      });
    }
  });

  it('create then delete offline syncs both, no conflict', async () => {
    const id = createWindow();
    service.delete({ collection: 'grade_entry_windows', id });

    await worker.syncActive();

    expect(conflicts()).toEqual([]);
    expect(unsentQueue()).toBe(0);
    expect(server.batches.map((batch) => batch.map((op) => op.operationType))).toEqual([['create'], ['delete']]);
    expect(server.row('grade_entry_windows', id)).toBeUndefined();
  });

  it('a window create the server already applied (lost acknowledgement) is not raised as a conflict', async () => {
    const id = createWindow();
    server.loseNextAcknowledgement = 'connection reset';
    await expect(worker.syncActive()).rejects.toThrow('connection reset');
    // Retry now rather than after the backoff.
    db().prepare(`UPDATE sync_queue SET nextAttemptAt=NULL WHERE entityId=?`).run(id);

    await worker.syncActive();

    // The server refuses the repeated create with its own copy, which differs
    // only in allowedRoles being a real list rather than SQLite's JSON text.
    expect(server.batches.map((batch) => batch.map((op) => op.operationType))).toEqual([['create'], ['create']]);
    expect(conflicts()).toEqual([]);
    expect(unsentQueue()).toBe(0);
  });

  it('an edit made after a push the server applied but never acknowledged still reaches the server', async () => {
    server.replayReceipts = true;
    const id = createWindow();
    await worker.syncActive();
    transition(id, { status: 'OPEN', openedAt: now() });

    // Applied on the server; the desktop only sees an unreachable server, so
    // the row goes back to pending with no backoff.
    server.loseNextAcknowledgement = 'The NEMIS server could not be reached.';
    await expect(worker.syncActive()).rejects.toThrow('The NEMIS server could not be reached.');
    expect(server.row('grade_entry_windows', id)?.status).toBe('OPEN');
    const unacknowledged = server.batches.at(-1)![0]!.operationId;

    transition(id, { status: 'CLOSED', closedAt: now() });
    await worker.syncActive();

    // The sent row is repeated as it was (its receipt is replayed), and the
    // new edit goes as its own operation in the next round, rebased onto the
    // token from that receipt.
    const [replayed, follower] = server.batches.slice(-2);
    expect(replayed!.map((op) => op.operationId)).toEqual([unacknowledged]);
    expect(follower!.map((op) => op.operationId)).not.toContain(unacknowledged);
    expect(conflicts()).toEqual([]);
    expect(unsentQueue()).toBe(0);
    expect(server.row('grade_entry_windows', id)?.status).toBe('CLOSED');
  });

  it('a web edit in between yields exactly one conflict; keep mine then syncs', async () => {
    const id = createWindow();
    await worker.syncActive();
    expect(server.row('grade_entry_windows', id)?.status).toBe('DRAFT');

    transition(id, { status: 'OPEN', openedAt: now() });
    server.editOnWeb('grade_entry_windows', id, { description: 'Changed on the web' });
    transition(id, { status: 'CLOSED', closedAt: now() });

    await worker.syncActive();

    const raised = conflicts();
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({
      entityType: 'grade_entry_windows',
      entityId: id,
      status: 'unresolved',
      reason: STALE_REASON,
    });
    expect(unsentQueue()).toBe(0);
    expect(server.row('grade_entry_windows', id)?.status).toBe('DRAFT');

    worker.resolveConflict({ conflictId: raised[0]!.id, resolution: 'keep_local' });
    await worker.syncActive();

    expect(conflicts()).toEqual([expect.objectContaining({ entityId: id, status: 'keep_local' })]);
    expect(unsentQueue()).toBe(0);
    expect(server.row('grade_entry_windows', id)?.status).toBe('CLOSED');
  });
});
