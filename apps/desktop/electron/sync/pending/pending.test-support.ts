import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { migrations } from '@app/database/migrations/registry';
import type { PendingContext } from './types';

export const NOW = '2026-10-16T12:00:00.000Z';
export const PAST = '2026-10-16T11:00:00.000Z';
export const FUTURE = '2026-10-16T12:05:00.000Z';
export const SCHOOL = 'school-1';

export function memoryDb(): SqliteDatabase {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  for (const migration of migrations) migration.up(db);
  // Seeds write tracked tables directly; keep the outbox triggers from
  // adding queue rows the tests didn't ask for.
  db.prepare(`UPDATE sync_runtime SET captureEnabled = 0`).run();
  return db;
}

export function ctx(db: SqliteDatabase, now = NOW): PendingContext {
  return { db, institutionId: SCHOOL, now };
}

export interface QueueRowInput {
  id: string;
  seq: number;
  entityType?: string;
  entityId?: string;
  operationType?: 'create' | 'update' | 'delete';
  status?: 'pending' | 'in_flight' | 'completed' | 'failed';
  nextAttemptAt?: string | null;
  deadLetter?: 0 | 1;
  retryCount?: number;
  createdAt?: string;
  payload?: string | null;
}

export function queueRow(db: SqliteDatabase, row: QueueRowInput): void {
  db.prepare(
    `INSERT INTO sync_queue
       (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt,nextAttemptAt,deadLetter,seq)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
    row.entityType ?? 'students',
    row.entityId ?? `e-${row.id}`,
    row.operationType ?? 'create',
    row.payload === undefined ? '{"record":{}}' : row.payload,
    row.retryCount ?? 0,
    row.status ?? 'pending',
    row.createdAt ?? PAST,
    row.createdAt ?? PAST,
    row.nextAttemptAt ?? null,
    row.deadLetter ?? 0,
    row.seq,
  );
}

export function seedStudent(db: SqliteDatabase, id: string, firstName: string, lastName: string, nemisId: string | null = null): void {
  db.prepare(
    `INSERT INTO students (id,institutionId,firstName,lastName,dateOfBirth,gender,version,updatedAt,nemisId)
     VALUES (?,?,?,?,'2015-01-01','FEMALE',1,?,?)`,
  ).run(id, SCHOOL, firstName, lastName, PAST, nemisId);
}

export function seedClass(db: SqliteDatabase, id: string, name: string): void {
  db.prepare(
    `INSERT INTO classes (id,institutionId,academicYearId,name,gradeLevel,version,updatedAt)
     VALUES (?,?,'y1',?,'GRADE_5',1,?)`,
  ).run(id, SCHOOL, name, PAST);
}

export function seedSubject(db: SqliteDatabase, id: string, name: string): void {
  db.prepare(
    `INSERT INTO subjects (id,institutionId,name,code,version,updatedAt) VALUES (?,?,?,?,1,?)`,
  ).run(id, SCHOOL, name, id, PAST);
}

export function seedAssignment(
  db: SqliteDatabase,
  id: string,
  opts: { title?: string; remoteId?: string | null; updatedAt?: string; syncedAt?: string | null } = {},
): void {
  db.prepare(
    `INSERT INTO assignments (id,classId,subjectId,teacherId,title,type,status,dueDate,createdAt,updatedAt,remoteId,syncedAt)
     VALUES (?,'c1',NULL,'t1',?,'HOMEWORK','PUBLISHED','2026-11-01',?,?,?,?)`,
  ).run(id, opts.title ?? 'Essay', PAST, opts.updatedAt ?? PAST, opts.remoteId ?? null, opts.syncedAt ?? null);
}

export function seedSubmission(
  db: SqliteDatabase,
  id: string,
  assignmentId: string,
  opts: { studentId?: string; grade?: number | null; updatedAt?: string; syncedAt?: string | null } = {},
): void {
  db.prepare(
    `INSERT INTO assignment_submissions (id,assignmentId,studentId,status,grade,createdAt,updatedAt,syncedAt)
     VALUES (?,?,?,'GRADED',?,?,?,?)`,
  ).run(id, assignmentId, opts.studentId ?? 's1', opts.grade === undefined ? 80 : opts.grade, PAST, opts.updatedAt ?? PAST, opts.syncedAt ?? null);
}

export function seedGradeCompletion(
  db: SqliteDatabase,
  id: string,
  opts: { studentId?: string; state?: 'pending' | 'synced' | 'rejected'; institutionId?: string; updatedAt?: string; syncError?: string | null } = {},
): void {
  db.prepare(
    `INSERT INTO grade_completions
       (id,studentId,institutionId,academicYearId,gradeLevel,outcome,nextGradeLevel,createdAt,updatedAt,syncState,syncError)
     VALUES (?,?,?,'y1','GRADE_7','PROMOTED','GRADE_8',?,?,?,?)`,
  ).run(id, opts.studentId ?? 's1', opts.institutionId ?? SCHOOL, PAST, opts.updatedAt ?? PAST, opts.state ?? 'pending', opts.syncError ?? null);
}

export function seedReversal(
  db: SqliteDatabase,
  id: string,
  paymentId: string,
  opts: { syncedAt?: string | null; updatedAt?: string } = {},
): void {
  db.prepare(
    `INSERT INTO fee_payment_reversals
       (id,paymentId,institutionId,reason,notes,reversedBy,reversedAt,createdAt,updatedAt,syncedAt)
     VALUES (?,?,?,'wrong amount',NULL,'admin-1',?,?,?,?)`,
  ).run(id, paymentId, SCHOOL, PAST, PAST, opts.updatedAt ?? PAST, opts.syncedAt ?? null);
}
