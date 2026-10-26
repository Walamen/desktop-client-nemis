import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

/**
 * Closed academic years are read-only on the local database, mirroring the
 * server's Postgres freeze triggers (spec §6.2). The switch is the same flag
 * the outbox triggers use: `sync_runtime.captureEnabled` is 1 for user writes
 * and 0 while the importer / sync worker apply server data — so a pull still
 * lands in a closed year, but an offline user cannot even queue a write to it.
 *
 * Trigger SQL is generated from the table → year-resolver map below, the way
 * installOutboxTriggers generates the outbox triggers.
 */

export type Alias = 'NEW' | 'OLD';
/** SQL expression resolving an academic year id from the row `a`. */
export type YearResolver = (a: Alias) => string;

export const YEAR_OF_CLASS: YearResolver = (a) => `(SELECT academicYearId FROM classes WHERE id = ${a}.classId)`;
const YEAR_OF_PERIOD: YearResolver = (a) =>
  `(SELECT academicYearId FROM grading_periods WHERE id = ${a}.gradingPeriodId)`;

/**
 * Expression resolving the owning academic year id of the row `a`, as
 * installed by this migration. (041 later adds the class's year for
 * enrollments; this map stays as 040 shipped it.)
 */
export const RESOLVERS: Record<string, YearResolver> = {
  // grades: grading period, else class, else the assessment's class.
  grades: (a) =>
    `COALESCE(${YEAR_OF_PERIOD(a)}, ${YEAR_OF_CLASS(a)}, ` +
    `(SELECT c.academicYearId FROM assessments x JOIN classes c ON c.id = x.classId WHERE x.id = ${a}.assessmentId))`,
  attendance: YEAR_OF_CLASS,
  assignments: YEAR_OF_CLASS,
  assignment_submissions: (a) =>
    `(SELECT c.academicYearId FROM assignments x JOIN classes c ON c.id = x.classId WHERE x.id = ${a}.assignmentId)`,
  term_averages: (a) => `(SELECT academicYearId FROM terms WHERE id = ${a}.termId)`,
  grade_completions: (a) => `${a}.academicYearId`,
  terms: (a) => `${a}.academicYearId`,
  classes: (a) => `${a}.academicYearId`,
  class_teachers: YEAR_OF_CLASS,
  class_subject_teachers: YEAR_OF_CLASS,
  class_subjects: YEAR_OF_CLASS,
  enrollments: (a) => `${a}.academicYearId`,
  assessment_templates: YEAR_OF_CLASS,
  assessments: YEAR_OF_CLASS,
  timetable_entries: YEAR_OF_CLASS,
  grading_periods: (a) => `${a}.academicYearId`,
  grade_entry_windows: YEAR_OF_PERIOD,
  grade_entry_window_classes: (a) =>
    `(SELECT g.academicYearId FROM grade_entry_windows w JOIN grading_periods g ON g.id = w.gradingPeriodId WHERE w.id = ${a}.windowId)`,
  class_resources: YEAR_OF_CLASS,
};

/** Teaching data: refused in a SETUP year as well as a CLOSED one. */
const TEACHING = new Set([
  'grades',
  'attendance',
  'assignments',
  'assignment_submissions',
  'term_averages',
  'grade_completions',
]);

/**
 * Columns written by sync bookkeeping with capture ON (not user edits). They
 * are left out of the UPDATE trigger's `OF` list so marking a row synced is
 * never refused. Verified against GradeCompletionSyncService (#mark: syncState,
 * syncError) and AssignmentSyncService (canonicalize: id, remoteId,
 * attachmentUrl, attachmentName, syncedAt on assignments; assignmentId re-point
 * and syncedAt on assignment_submissions).
 */
const BOOKKEEPING: Record<string, readonly string[]> = {
  grade_completions: ['syncState', 'syncError'],
  assignments: ['id', 'remoteId', 'attachmentUrl', 'attachmentName', 'syncedAt'],
  assignment_submissions: ['assignmentId', 'syncedAt'],
};

const CAPTURE_ON = `(SELECT captureEnabled FROM sync_runtime WHERE id = 'singleton') = 1`;

/** Year statuses that refuse user writes. 040 froze CLOSED only; 043 adds REOPENED. */
export type FrozenStatuses = readonly ('CLOSED' | 'REOPENED')[];
const CLOSED_ONLY: FrozenStatuses = ['CLOSED'];

function guards(table: string, resolvers: readonly YearResolver[], alias: Alias, frozen: FrozenStatuses): string {
  const frozenSql = frozen.map((f) => `'${f}'`).join(', ');
  let sql = '';
  for (const resolve of resolvers) {
    const status = `(SELECT status FROM academic_years WHERE id = ${resolve(alias)})`;
    sql += `SELECT RAISE(ABORT, 'ACADEMIC_YEAR_CLOSED') WHERE ${status} IN (${frozenSql});\n`;
    if (TEACHING.has(table)) {
      sql += `SELECT RAISE(ABORT, 'ACADEMIC_YEAR_NOT_STARTED') WHERE ${status} = 'SETUP';\n`;
    }
  }
  return sql;
}

/**
 * Creates freeze_<table>_{insert,update,delete}. Every resolver is checked on
 * the NEW row (insert, update) and the OLD row (update, delete), so a row whose
 * year can be resolved more than one way (an enrolment: its own academicYearId
 * and its class's year) is refused if any of them lands in a frozen year.
 */
export function installTableFreezeTriggers(
  db: SqliteDatabase,
  table: string,
  resolvers: readonly YearResolver[],
  frozen: FrozenStatuses = CLOSED_ONLY,
): void {
  const columns = (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name);
  if (columns.length === 0) throw new Error(`freeze triggers: table ${table} does not exist`);
  const skip = BOOKKEEPING[table] ?? [];
  const updateOf = columns.filter((c) => !skip.includes(c));
  const updateEvent = skip.length > 0 ? `UPDATE OF ${updateOf.map((c) => `"${c}"`).join(', ')}` : 'UPDATE';
  const defs: [string, string, string][] = [
    ['insert', 'INSERT', guards(table, resolvers, 'NEW', frozen)],
    ['update', updateEvent, guards(table, resolvers, 'OLD', frozen) + guards(table, resolvers, 'NEW', frozen)],
    ['delete', 'DELETE', guards(table, resolvers, 'OLD', frozen)],
  ];
  for (const [action, event, body] of defs) {
    db.exec(`
      CREATE TRIGGER freeze_${table}_${action}
      BEFORE ${event} ON "${table}"
      WHEN ${CAPTURE_ON}
      BEGIN
        ${body}
      END;
    `);
  }
}

/** The academic_years triggers: user edits refused once the year is frozen, deletes once it has started. */
export function installYearRowTriggers(db: SqliteDatabase, frozen: FrozenStatuses = CLOSED_ONLY): void {
  const frozenSql = frozen.map((f) => `'${f}'`).join(', ');
  db.exec(`
    CREATE TRIGGER freeze_academic_years_update
    BEFORE UPDATE ON academic_years
    WHEN ${CAPTURE_ON} AND OLD.status IN (${frozenSql})
    BEGIN
      SELECT RAISE(ABORT, 'ACADEMIC_YEAR_CLOSED');
    END;

    CREATE TRIGGER freeze_academic_years_delete
    BEFORE DELETE ON academic_years
    WHEN ${CAPTURE_ON} AND OLD.status <> 'SETUP'
    BEGIN
      SELECT RAISE(ABORT, 'ACADEMIC_YEAR_NOT_DELETABLE');
    END;
  `);
}

export function installFreezeTriggers(db: SqliteDatabase): void {
  for (const [table, resolve] of Object.entries(RESOLVERS)) {
    installTableFreezeTriggers(db, table, [resolve]);
  }
  installYearRowTriggers(db);
}

export const createAcademicYearFreeze: Migration = {
  version: 40,
  name: 'create-academic-year-freeze',
  up(db: SqliteDatabase): void {
    installFreezeTriggers(db);
  },
};
