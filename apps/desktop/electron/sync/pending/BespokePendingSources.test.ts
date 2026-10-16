import { describe, expect, it } from 'vitest';
import { AssignmentPendingSource } from './AssignmentPendingSource';
import { FeeReversalPendingSource } from './FeeReversalPendingSource';
import { GradeCompletionPendingSource } from './GradeCompletionPendingSource';
import { NOW, PAST, ctx, memoryDb, queueRow, seedAssignment, seedGradeCompletion, seedReversal, seedSubmission } from './pending.test-support';

describe('AssignmentPendingSource', () => {
  const source = new AssignmentPendingSource();

  it('lists unsynced and edited assignments, not synced ones', () => {
    const db = memoryDb();
    seedAssignment(db, 'new');
    seedAssignment(db, 'edited', { remoteId: 'r1', syncedAt: PAST, updatedAt: NOW });
    seedAssignment(db, 'clean', { remoteId: 'r2', syncedAt: NOW, updatedAt: PAST });
    const groups = source.summarize(ctx(db));
    expect(groups.find((g) => g.groupKey === 'assignments:assignments')).toMatchObject({ total: 2, byState: { waiting: 2 } });
    const { rows } = source.listRecords(ctx(db), 'assignments', 50, 0);
    expect(rows.map((r) => [r.id, r.operationType])).toEqual([['new', 'create'], ['edited', 'update']]);
  });

  it('holds graded submissions whose assignment has no remote id; ignores ungraded ones', () => {
    const db = memoryDb();
    seedAssignment(db, 'local');
    seedAssignment(db, 'remote', { remoteId: 'r1', syncedAt: NOW, updatedAt: PAST });
    seedSubmission(db, 'held', 'local');
    seedSubmission(db, 'ready', 'remote');
    seedSubmission(db, 'ungraded', 'remote', { grade: null, studentId: 's2' });
    const group = source.summarize(ctx(db)).find((g) => g.groupKey === 'assignments:assignment_submissions');
    expect(group).toMatchObject({ label: 'Assignment grades', total: 2, byState: { held: 1, waiting: 1 } });
    const { rows } = source.listRecords(ctx(db), 'assignment_submissions', 50, 0);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.state]))).toEqual({ held: 'held', ready: 'waiting' });
    expect(source.countPending(ctx(db))).toBe(3);
  });
});

describe('GradeCompletionPendingSource', () => {
  const source = new GradeCompletionPendingSource();

  it('counts pending for this institution only; rejected ones are failures', () => {
    const db = memoryDb();
    seedGradeCompletion(db, 'mine', { studentId: 's1' });
    seedGradeCompletion(db, 'other-school', { studentId: 's2', institutionId: 'school-2' });
    seedGradeCompletion(db, 'rejected', { studentId: 's3', state: 'rejected', syncError: 'bad' });
    seedGradeCompletion(db, 'done', { studentId: 's4', state: 'synced' });
    expect(source.countPending(ctx(db))).toBe(1);
    expect(source.countFailed(ctx(db))).toBe(1);
    expect(source.listRecords(ctx(db), 'grade_completions', 50, 0).rows.map((r) => r.id)).toEqual(['mine']);
  });

  it('is held while student or enrolment rows are still queued', () => {
    const db = memoryDb();
    seedGradeCompletion(db, 'gc1');
    expect(source.summarize(ctx(db))[0]?.byState).toMatchObject({ waiting: 1, held: 0 });
    queueRow(db, { id: 'q1', seq: 1, entityType: 'enrollments' });
    expect(source.summarize(ctx(db))[0]?.byState).toMatchObject({ waiting: 0, held: 1 });
    expect(source.listRecords(ctx(db), 'grade_completions', 50, 0).rows[0]?.state).toBe('held');
  });
});

describe('FeeReversalPendingSource', () => {
  const source = new FeeReversalPendingSource();

  it('holds a reversal whose payment has not finished syncing', () => {
    const db = memoryDb();
    seedReversal(db, 'rev1', 'pay-1');
    seedReversal(db, 'rev2', 'pay-2');
    seedReversal(db, 'rev3', 'pay-3', { syncedAt: NOW });
    queueRow(db, { id: 'q1', seq: 1, entityType: 'fee_payments', entityId: 'pay-1' });
    queueRow(db, { id: 'q2', seq: 2, entityType: 'fee_payments', entityId: 'pay-2', status: 'completed' });
    expect(source.summarize(ctx(db))[0]).toMatchObject({
      groupKey: 'fee_reversals:fee_payment_reversals', total: 2, byState: { held: 1, waiting: 1 },
    });
    const { rows } = source.listRecords(ctx(db), 'fee_payment_reversals', 50, 0);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.state]))).toEqual({ rev1: 'held', rev2: 'waiting' });
  });

  it('holds a reversal whose payment create failed (dead-lettered)', () => {
    const db = memoryDb();
    seedReversal(db, 'rev1', 'pay-1');
    queueRow(db, { id: 'q1', seq: 1, entityType: 'fee_payments', entityId: 'pay-1', status: 'failed', deadLetter: 1, retryCount: 5 });
    expect(source.summarize(ctx(db))[0]).toMatchObject({ total: 1, byState: { held: 1, waiting: 0 } });
    const { rows } = source.listRecords(ctx(db), 'fee_payment_reversals', 50, 0);
    expect(rows[0]?.state).toBe('held');
  });

  it('returns nothing for an entity type it does not own', () => {
    expect(source.listRecords(ctx(memoryDb()), 'students', 50, 0)).toEqual({ rows: [], total: 0 });
  });
});
