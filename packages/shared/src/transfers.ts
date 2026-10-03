/**
 * A RECEIVING_SCHOOL request whose window has passed counts as agreed. Pure
 * function of `lapsesAt` and the supplied clock; no scheduler is involved.
 *
 * Mirrors `isLapsed` in the server's
 * apps/Server/src/student-transfers/student-transfers.service.ts. Strictly
 * less: a deadline equal to `now` is not lapsed; an unparseable date is not
 * lapsed.
 */
export function isLapsed(
  row: { status: string; initiatedBy: string | null; lapsesAt: string | null },
  now: number,
): boolean {
  return (
    row.status === 'PENDING' &&
    row.initiatedBy === 'RECEIVING_SCHOOL' &&
    row.lapsesAt !== null &&
    Date.parse(row.lapsesAt) < now
  );
}
