/** "Not yet on the server" predicates for the bespoke push paths, and the
 * ordering gates that hold them back. Each push service and its
 * pending-changes source (sync/pending/) read the same constant, so the
 * Pending changes page can never list something the push would skip, or
 * miss something it would send. */

/** assignments: never pushed, or edited since the last push. */
export const ASSIGNMENT_DIRTY = `(syncedAt IS NULL OR updatedAt > syncedAt)`;

/** assignment_submissions aliased `s`: only graded rows ever push. */
export const SUBMISSION_DIRTY = `(s.grade IS NOT NULL AND (s.syncedAt IS NULL OR s.updatedAt > s.syncedAt))`;

/** grade_completions queued for this institution. Bind: institutionId. */
export const GRADE_COMPLETION_PENDING = `syncState='pending' AND institutionId=?`;

/** Ordering gate for grade completions: the server can only stamp students
 * and enrolments it already has. Waits only on rows that can still go
 * through — dead-lettered ones ('failed') never self-resolve. */
export const STUDENT_RECORDS_UNSETTLED = `EXISTS (
  SELECT 1 FROM sync_queue
  WHERE entityType IN ('students','enrollments') AND status IN ('pending','in_flight')
)`;

/** fee_payment_reversals not yet accepted by the server. */
export const FEE_REVERSAL_PENDING = `syncedAt IS NULL`;

/** Ordering gate for a reversal: the server can only reverse a payment it
 * already has, so anything but a completed create holds it back.
 * `paymentIdExpr` is `?` or a column reference. */
export function feePaymentUnsettled(paymentIdExpr: string): string {
  return `EXISTS (
    SELECT 1 FROM sync_queue
    WHERE entityType='fee_payments' AND entityId=${paymentIdExpr} AND status<>'completed'
  )`;
}
