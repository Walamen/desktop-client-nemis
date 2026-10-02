import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { ProvisioningRow } from '@nemis-desktop/types';

/**
 * A child who leaves this school is never re-sent by the snapshot, which only
 * ships students currently at it — so without this the local row would keep
 * claiming the child forever. Every move between schools (approval, registry
 * claim, completed lapse) leaves an APPROVED transfer whose fromInstitutionId is
 * the school the child left, and those rows ARE pulled. NEMIS ID desktop parity
 * spec §5.3.
 *
 * - The student's own row in the same pull is the current truth (a child who
 *   left and came back inside one sync window), so it wins.
 * - A child may have left this school more than once; the latest reviewedAt
 *   decides, never array order.
 * - A transfer only moves a student when its reviewedAt is strictly later than
 *   the local students.updatedAt (the server's move bumps updatedAt). A historic
 *   departure row re-sent after the child returned must not move them again, and
 *   a transfer with no reviewedAt moves nobody.
 * - The row is re-pointed, not deleted, so enrolments, grades and attendance
 *   survive — but only until the next full (24-hour, merge:false) resync: the
 *   snapshot scopes those collections by the student's CURRENT institution, so
 *   the resync drops them. Stage 5 widens the snapshot to make the history durable.
 * - Must run while sync capture is off (inside the import transaction): this
 *   mirrors server state and must never be pushed.
 * - A workspace with no institution (DEO/county/ministry) holds several schools
 *   legitimately; nothing to do.
 */
export function applyDepartures(
  db: SqliteDatabase,
  institutionId: string | null | undefined,
  transfers: readonly ProvisioningRow[],
  students: readonly ProvisioningRow[],
): void {
  if (!institutionId) return;
  const pulled = new Set(students.map((row) => String(row.id)));
  const latest = new Map<string, ProvisioningRow>();
  for (const row of transfers) {
    if (row.status !== 'APPROVED' || row.fromInstitutionId !== institutionId) continue;
    const studentId = String(row.studentId);
    if (pulled.has(studentId)) continue;
    const current = latest.get(studentId);
    if (!current || String(row.reviewedAt ?? '') > String(current.reviewedAt ?? '')) {
      latest.set(studentId, row);
    }
  }
  const move = db.prepare(
    `UPDATE students SET institutionId = ? WHERE id = ? AND institutionId = ? AND updatedAt < ?`,
  );
  for (const [studentId, row] of latest) {
    if (!row.reviewedAt) continue;
    move.run(String(row.toInstitutionId), studentId, institutionId, String(row.reviewedAt));
  }
}
