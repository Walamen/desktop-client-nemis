import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineError, RemoteRejectedError } from '@nemis-desktop/shared';
import { migrations } from '@app/database/migrations/registry';
import { GradeCompletionSyncService } from './GradeCompletionSyncService';

const SCHOOL = 'school-1';

function db(): SqliteDatabase {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(connection);
  return connection;
}

function seed(
  connection: SqliteDatabase,
  studentId: string,
  opts: {
    year?: string;
    grade?: string;
    outcome?: string;
    next?: string | null;
    notes?: string | null;
    state?: string;
    institutionId?: string;
    error?: string | null;
  } = {},
) {
  const now = new Date().toISOString();
  connection
    .prepare(
      `INSERT INTO grade_completions
         (id,studentId,institutionId,academicYearId,gradeLevel,outcome,nextGradeLevel,notes,createdAt,updatedAt,syncState,syncError)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      `gc-${studentId}-${opts.year ?? 'y1'}`,
      studentId,
      opts.institutionId ?? SCHOOL,
      opts.year ?? 'y1',
      opts.grade ?? 'GRADE_7',
      opts.outcome ?? 'PROMOTED',
      opts.next === undefined ? 'GRADE_8' : opts.next,
      opts.notes ?? null,
      now,
      now,
      opts.state ?? 'pending',
      opts.error ?? null,
    );
}

let queueSeq = 0;
function queue(connection: SqliteDatabase, entityType: string, status: string, deadLetter = 0) {
  const now = new Date().toISOString();
  queueSeq += 1;
  connection
    .prepare(
      `INSERT INTO sync_queue
         (id,entityType,entityId,operationType,payload,retryCount,status,deadLetter,createdAt,updatedAt)
       VALUES (?,?,?,'create','{}',0,?,?,?,?)`,
    )
    .run(`q-${queueSeq}`, entityType, `e-${queueSeq}`, status, deadLetter, now, now);
}

function stateOf(connection: SqliteDatabase, studentId: string, year = 'y1') {
  return connection
    .prepare(`SELECT syncState, syncError FROM grade_completions WHERE studentId=? AND academicYearId=?`)
    .get(studentId, year) as { syncState: string; syncError: string | null };
}

describe('GradeCompletionSyncService', () => {
  let connection: SqliteDatabase;
  beforeEach(() => {
    connection = db();
  });

  it('sends one request per (year, grade) with the decisions of that group', async () => {
    seed(connection, 's1');
    seed(connection, 's2', { outcome: 'GRADUATED', next: null, notes: 'Top of class' });
    seed(connection, 's3', { grade: 'GRADE_8', next: 'GRADE_9' });
    seed(connection, 's4', { year: 'y2' });
    seed(connection, 's5', { state: 'synced' });
    const recordGradeCompletions = vi.fn().mockResolvedValue(undefined);
    await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
    expect(recordGradeCompletions).toHaveBeenCalledTimes(3);
    const byKey = new Map(
      recordGradeCompletions.mock.calls.map(([request]) => [
        `${request.academicYearId}/${request.gradeLevel}`,
        request,
      ]),
    );
    expect(byKey.get('y1/GRADE_7')).toEqual({
      academicYearId: 'y1',
      gradeLevel: 'GRADE_7',
      decisions: [
        { studentId: 's1', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_8' },
        { studentId: 's2', outcome: 'GRADUATED', notes: 'Top of class' },
      ],
    });
    expect(byKey.get('y1/GRADE_8')?.decisions).toHaveLength(1);
    expect(byKey.get('y2/GRADE_7')?.decisions).toHaveLength(1);
  });

  it('marks every row of a successful group synced and clears syncError', async () => {
    seed(connection, 's1');
    seed(connection, 's2');
    seed(connection, 's3', { state: 'rejected', error: 'old' });
    const recordGradeCompletions = vi.fn().mockResolvedValue(undefined);
    await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
    expect(stateOf(connection, 's1')).toEqual({ syncState: 'synced', syncError: null });
    expect(stateOf(connection, 's2')).toEqual({ syncState: 'synced', syncError: null });
    // A rejected row awaits the user; it is not re-sent.
    expect(stateOf(connection, 's3')).toEqual({ syncState: 'rejected', syncError: 'old' });
  });

  it('only pushes rows of this school', async () => {
    seed(connection, 's1', { institutionId: 'other-school' });
    const recordGradeCompletions = vi.fn().mockResolvedValue(undefined);
    await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
    expect(recordGradeCompletions).not.toHaveBeenCalled();
    expect(stateOf(connection, 's1').syncState).toBe('pending');
  });

  describe('ordering gate', () => {
    it.each([
      ['students', 'pending'],
      ['students', 'in_flight'],
      ['enrollments', 'pending'],
      ['enrollments', 'in_flight'],
    ])('waits while a %s row is %s', async (entityType, status) => {
      seed(connection, 's1');
      queue(connection, entityType, status);
      const recordGradeCompletions = vi.fn().mockResolvedValue(undefined);
      await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
      expect(recordGradeCompletions).not.toHaveBeenCalled();
      expect(stateOf(connection, 's1').syncState).toBe('pending');
    });

    it('does not wait on dead-lettered, completed or unrelated queue rows', async () => {
      seed(connection, 's1');
      queue(connection, 'students', 'failed', 1);
      queue(connection, 'enrollments', 'failed', 1);
      queue(connection, 'students', 'completed');
      queue(connection, 'attendance', 'pending');
      const recordGradeCompletions = vi.fn().mockResolvedValue(undefined);
      await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
      expect(recordGradeCompletions).toHaveBeenCalledTimes(1);
      expect(stateOf(connection, 's1').syncState).toBe('synced');
    });
  });

  it('a 4xx rejects the whole group with the server message', async () => {
    seed(connection, 's1');
    seed(connection, 's2');
    const recordGradeCompletions = vi
      .fn()
      .mockRejectedValue(new RemoteRejectedError(400, 'Student s2 is already stamped at another grade.'));
    await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
    for (const id of ['s1', 's2']) {
      expect(stateOf(connection, id)).toEqual({
        syncState: 'rejected',
        syncError: 'Student s2 is already stamped at another grade.',
      });
    }
  });

  it('a business 403 rejects the group, and a missing message uses fixed text', async () => {
    seed(connection, 's1');
    const recordGradeCompletions = vi.fn().mockRejectedValue(new RemoteRejectedError(403, undefined));
    await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
    expect(stateOf(connection, 's1')).toEqual({
      syncState: 'rejected',
      syncError: 'The server rejected these decisions.',
    });
  });

  it.each([
    ['5xx', Object.assign(new Error('Provisioning request failed with status 503.'), { status: 503 })],
    ['offline', new OfflineError()],
    ['plain error', new Error('boom')],
  ])('%s leaves the group pending', async (_label, error) => {
    seed(connection, 's1');
    const recordGradeCompletions = vi.fn().mockRejectedValue(error);
    await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
    expect(stateOf(connection, 's1')).toEqual({ syncState: 'pending', syncError: null });
  });

  it('a transport failure in one group does not stop another', async () => {
    seed(connection, 's1', { year: 'y1' });
    seed(connection, 's2', { year: 'y2' });
    const recordGradeCompletions = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
    expect(recordGradeCompletions).toHaveBeenCalledTimes(2);
    expect(stateOf(connection, 's1', 'y1').syncState).toBe('pending');
    expect(stateOf(connection, 's2', 'y2').syncState).toBe('synced');
  });

  it('a rejection of one group does not stop another', async () => {
    seed(connection, 's1', { year: 'y1' });
    seed(connection, 's2', { year: 'y2' });
    const recordGradeCompletions = vi
      .fn()
      .mockRejectedValueOnce(new RemoteRejectedError(400, 'No.'))
      .mockResolvedValueOnce(undefined);
    await new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(connection, SCHOOL);
    expect(stateOf(connection, 's1', 'y1').syncState).toBe('rejected');
    expect(stateOf(connection, 's2', 'y2').syncState).toBe('synced');
  });

  it('never throws, even if the local database fails', async () => {
    const broken = db();
    broken.close();
    const recordGradeCompletions = vi.fn();
    await expect(
      new GradeCompletionSyncService({ recordGradeCompletions }).pushPending(broken, SCHOOL),
    ).resolves.toBeUndefined();
  });
});
