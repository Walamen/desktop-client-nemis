/**
 * The server refuses any offline write into a closed (or not-yet-started)
 * academic year with a sync-conflict reason of the form
 * `ACADEMIC_YEAR_<STATE>: <friendly message>`. These rejections are never a
 * clock-skew false positive: the worker must always record them, and the UI
 * must not offer "keep mine" (re-sending would just be refused again).
 */
export function isAcademicYearRejection(reason: string | null | undefined): boolean {
  if (typeof reason !== 'string') return false;
  // Stage 5: the carried-cell guard behaves the same way (re-sending is
  // refused again; discarding reloads the record from the server).
  return (
    reason.startsWith('ACADEMIC_YEAR_') ||
    reason.startsWith('TRANSFER_CARRIED_CELL:') ||
    reason.startsWith('TRANSFER_MATCH_PENDING:')
  );
}

/** The user-facing part of the reason, after the first `": "`. */
export function academicYearRejectionMessage(reason: string): string {
  const at = reason.indexOf(': ');
  return at === -1 ? '' : reason.slice(at + 2);
}

export type AcademicYearViolation =
  | 'ACADEMIC_YEAR_CLOSED'
  | 'ACADEMIC_YEAR_NOT_STARTED'
  | 'ACADEMIC_YEAR_ALREADY_ACTIVE'
  | 'ACADEMIC_YEAR_NOT_DELETABLE'
  | 'TRANSFER_CARRIED_CELL'
  | 'TRANSFER_MATCH_PENDING';

/** The server's user-facing text per violation (HttpExceptionFilter), verbatim. */
export const ACADEMIC_YEAR_MESSAGES: Readonly<Record<AcademicYearViolation, string>> = {
  ACADEMIC_YEAR_CLOSED: 'This academic year is closed. Its records can no longer be changed.',
  ACADEMIC_YEAR_NOT_STARTED:
    'This academic year has not started yet. Grades, attendance and assignments can be recorded once it starts.',
  ACADEMIC_YEAR_ALREADY_ACTIVE:
    'Another academic year is already active for this school. Close it before starting a new one.',
  ACADEMIC_YEAR_NOT_DELETABLE: 'Only an academic year that is still being set up can be deleted.',
  TRANSFER_CARRIED_CELL: "This mark was carried from the student's previous school and cannot be changed here.",
  TRANSFER_MATCH_PENDING: "Match this student's prior record before entering marks for periods before they joined.",
};

/** Sync Conflicts card heading per violation token. */
export const ACADEMIC_YEAR_REJECTION_HEADINGS: Readonly<Record<AcademicYearViolation, string>> = {
  ACADEMIC_YEAR_CLOSED: 'Rejected — academic year closed',
  ACADEMIC_YEAR_NOT_STARTED: 'Rejected — academic year not started',
  ACADEMIC_YEAR_ALREADY_ACTIVE: 'Rejected — another academic year is active',
  ACADEMIC_YEAR_NOT_DELETABLE: 'Rejected — academic year cannot be deleted',
  TRANSFER_CARRIED_CELL: 'Rejected — mark carried from another school',
  TRANSFER_MATCH_PENDING: 'Rejected — prior record not matched yet',
};

function isViolation(value: string | undefined): value is AcademicYearViolation {
  return value !== undefined && Object.prototype.hasOwnProperty.call(ACADEMIC_YEAR_MESSAGES, value);
}

/** Heading for an academic-year rejection reason; an unknown future
 * `ACADEMIC_YEAR_*` token reads as "closed", the common case. */
export function academicYearRejectionHeading(reason: string): string {
  const token = reason.split(':', 1)[0];
  return isViolation(token)
    ? ACADEMIC_YEAR_REJECTION_HEADINGS[token]
    : ACADEMIC_YEAR_REJECTION_HEADINGS.ACADEMIC_YEAR_CLOSED;
}

/** The violation a server refusal stands for: the errorCode when it is a
 * token (a freeze trigger fired), else the exact friendly message (a service
 * that raised a plain ConflictException with that text), else undefined. */
export function academicYearTokenOf(
  errorCode: string | undefined,
  message: string | undefined,
): AcademicYearViolation | undefined {
  if (isViolation(errorCode)) return errorCode;
  return (Object.keys(ACADEMIC_YEAR_MESSAGES) as AcademicYearViolation[]).find(
    (token) => ACADEMIC_YEAR_MESSAGES[token] === message,
  );
}

/** Shown verbatim to the admin when an enrolment is refused because the child
 * was enrolled in an earlier year; identical to the server's refusal. */
export const RETURNING_STUDENT_REFUSAL =
  'This student was enrolled in an earlier year. Enrol them for this year through the student lookup.';

/** The server's refusal when a grading period already has a grade entry window
 * (window-only grade windows); identical to the server's text. A refused
 * duplicate leaves a local-only row, so discarding it needs a full resync. */
export const GRADE_WINDOW_DUPLICATE_REFUSAL = 'This grading period already has a grade entry window.';
