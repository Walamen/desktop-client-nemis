import type { Database as SqliteDatabase } from 'better-sqlite3';
import { humanizeEntityType, pickEntityLabel } from '@nemis-desktop/shared';
import type { PendingRecord } from '@nemis-desktop/types';
import { logger } from '@app/services/logger';
import type { RawPendingRow } from './types';

const STUDENT = `s.firstName || ' ' || s.lastName`;

function named(table: string, column: string): string {
  return `SELECT id, ${column} AS label FROM ${table} WHERE id IN (__IDS__)`;
}

/** One SELECT per entity type per page (ids bound into IN (…)). A NULL label
 * — a join partner missing — falls through to the payload fallback. */
const LOOKUPS: Readonly<Record<string, string>> = {
  students: `SELECT id, firstName || ' ' || lastName || COALESCE(' · ' || nemisId, '') AS label FROM students WHERE id IN (__IDS__)`,
  guardians: named('guardians', `firstName || ' ' || lastName`),
  staff: named('staff', `firstName || ' ' || lastName`),
  student_guardians: `SELECT sg.id, g.firstName || ' ' || g.lastName || ' → ' || ${STUDENT} AS label
    FROM student_guardians sg JOIN guardians g ON g.id = sg.guardianId JOIN students s ON s.id = sg.studentId
    WHERE sg.id IN (__IDS__)`,
  enrollments: `SELECT e.id, ${STUDENT} || ' · ' || c.name AS label
    FROM enrollments e JOIN students s ON s.id = e.studentId JOIN classes c ON c.id = e.classId
    WHERE e.id IN (__IDS__)`,
  attendance: `SELECT a.id, ${STUDENT} || ' · ' || c.name || COALESCE(' · ' || sub.name, '') || ' · ' || a.date AS label
    FROM attendance a JOIN students s ON s.id = a.studentId JOIN classes c ON c.id = a.classId
    LEFT JOIN subjects sub ON sub.id = a.subjectId
    WHERE a.id IN (__IDS__)`,
  grades: `SELECT g.id, ${STUDENT} || ' · ' || sub.name AS label
    FROM grades g JOIN students s ON s.id = g.studentId JOIN subjects sub ON sub.id = g.subjectId
    WHERE g.id IN (__IDS__)`,
  assignment_submissions: `SELECT x.id, ${STUDENT} || ' · ' || a.title AS label
    FROM assignment_submissions x JOIN students s ON s.id = x.studentId JOIN assignments a ON a.id = x.assignmentId
    WHERE x.id IN (__IDS__)`,
  grade_completions: `SELECT gc.id, ${STUDENT} AS label, gc.gradeLevel AS gradeLevel, gc.outcome AS outcome
    FROM grade_completions gc JOIN students s ON s.id = gc.studentId
    WHERE gc.id IN (__IDS__)`,
  fee_payments: `SELECT p.id, ${STUDENT} || ' · receipt ' || p.receiptNumber AS label
    FROM fee_payments p JOIN students s ON s.id = p.studentId
    WHERE p.id IN (__IDS__)`,
  fee_obligations: `SELECT o.id, ${STUDENT} AS label
    FROM fee_obligations o JOIN students s ON s.id = o.studentId
    WHERE o.id IN (__IDS__)`,
  fee_payment_reversals: `SELECT r.id, ${STUDENT} || ' · receipt ' || p.receiptNumber AS label
    FROM fee_payment_reversals r JOIN fee_payments p ON p.id = r.paymentId JOIN students s ON s.id = p.studentId
    WHERE r.id IN (__IDS__)`,
  school_registrations: `SELECT id, json_extract(payload, '$.name') AS label FROM school_registrations
    WHERE json_valid(payload) AND id IN (__IDS__)`,
  classes: named('classes', 'name'),
  subjects: named('subjects', 'name'),
  academic_years: named('academic_years', 'code'),
  terms: named('terms', 'name'),
  assessment_templates: named('assessment_templates', 'name'),
  assessments: named('assessments', 'name'),
  assignments: named('assignments', 'title'),
  grading_periods: named('grading_periods', 'name'),
  grade_entry_windows: named('grade_entry_windows', 'name'),
  fee_rules: named('fee_rules', 'name'),
  announcements: named('announcements', 'title'),
};

/** Entity types with a local-table label lookup (exported for the schema-drift test). */
export const PENDING_LABEL_TYPES: readonly string[] = Object.keys(LOOKUPS);

export class PendingLabelResolver {
  resolve(db: SqliteDatabase, rows: readonly RawPendingRow[]): PendingRecord[] {
    const idsByType = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!Object.hasOwn(LOOKUPS, row.entityType)) continue;
      const ids = idsByType.get(row.entityType) ?? new Set<string>();
      ids.add(row.entityId);
      idsByType.set(row.entityType, ids);
    }

    const labels = new Map<string, string>();
    for (const [entityType, ids] of idsByType) {
      const template = LOOKUPS[entityType];
      if (!template) continue;
      const list = [...ids];
      const sql = template.replace('__IDS__', list.map(() => '?').join(','));
      try {
        for (const found of db.prepare(sql).all(...list) as Array<{ id: string; label: string | null; gradeLevel?: string; outcome?: string }>) {
          if (!found.label) continue;
          const label = entityType === 'grade_completions' && found.gradeLevel && found.outcome
            ? [found.label, humanizeEntityType(found.gradeLevel), humanizeEntityType(found.outcome)].join(' · ')
            : found.label;
          labels.set(`${entityType}\u0000${found.id}`, label);
        }
      } catch (error) {
        logger.warn(`PendingLabelResolver: label lookup failed for ${entityType}`, error);
      }
    }

    return rows.map((row) => ({
      ...row,
      label:
        labels.get(`${row.entityType}\u0000${row.entityId}`)
        ?? pickEntityLabel(row.payload, null, row.entityType, row.entityId),
    }));
  }
}
