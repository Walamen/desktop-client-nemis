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
