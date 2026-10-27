/**
 * The server refuses any offline write into a closed (or not-yet-started)
 * academic year with a sync-conflict reason of the form
 * `ACADEMIC_YEAR_<STATE>: <friendly message>`. These rejections are never a
 * clock-skew false positive: the worker must always record them, and the UI
 * must not offer "keep mine" (re-sending would just be refused again).
 */
export function isAcademicYearRejection(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && reason.startsWith('ACADEMIC_YEAR_');
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
  | 'ACADEMIC_YEAR_NOT_DELETABLE';

/** The server's user-facing text per violation (HttpExceptionFilter), verbatim. */
export const ACADEMIC_YEAR_MESSAGES: Readonly<Record<AcademicYearViolation, string>> = {
  ACADEMIC_YEAR_CLOSED: 'This academic year is closed. Its records can no longer be changed.',
  ACADEMIC_YEAR_NOT_STARTED:
    'This academic year has not started yet. Grades, attendance and assignments can be recorded once it starts.',
  ACADEMIC_YEAR_ALREADY_ACTIVE:
    'Another academic year is already active for this school. Close it before starting a new one.',
  ACADEMIC_YEAR_NOT_DELETABLE: 'Only an academic year that is still being set up can be deleted.',
};

/** Sync Conflicts card heading per violation token. */
export const ACADEMIC_YEAR_REJECTION_HEADINGS: Readonly<Record<AcademicYearViolation, string>> = {
  ACADEMIC_YEAR_CLOSED: 'Rejected — academic year closed',
  ACADEMIC_YEAR_NOT_STARTED: 'Rejected — academic year not started',
  ACADEMIC_YEAR_ALREADY_ACTIVE: 'Rejected — another academic year is active',
  ACADEMIC_YEAR_NOT_DELETABLE: 'Rejected — academic year cannot be deleted',
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
