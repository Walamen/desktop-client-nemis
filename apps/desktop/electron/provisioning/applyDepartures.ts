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
 * - The row is re-pointed, not deleted: enrolments, grades and attendance are
 *   history, and the End-of-Year Outcomes cohort needs them.
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
    `UPDATE students SET institutionId = ? WHERE id = ? AND institutionId = ?`,
  );
  for (const [studentId, row] of latest) {
    move.run(String(row.toInstitutionId), studentId, institutionId);
  }
}
