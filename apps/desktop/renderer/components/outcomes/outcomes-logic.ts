import {
  GradeLevel,
  type CohortRow,
  type CompletionDecision,
  type CompletionOutcome,
} from '@nemis-desktop/types';

/** Every grade, in school order (KG … GRADE_12). */
export const GRADE_ORDER: readonly GradeLevel[] = Object.values(GradeLevel);

/** The editable state of one row in the outcomes table. */
export interface OutcomeDraft {
  outcome: CompletionOutcome | '';
  nextGradeLevel: GradeLevel | '';
  notes: string;
}

export const studentName = (row: Pick<CohortRow, 'firstName' | 'lastName'>) =>
  `${row.firstName} ${row.lastName}`.trim();

export function draftFromRow(row: CohortRow): OutcomeDraft {
  return { outcome: row.outcome ?? '', nextGradeLevel: row.nextGradeLevel ?? '', notes: row.notes ?? '' };
}

/** Promoted → the following grade (none after the last); Retained → the same
 * grade; Graduated → no next grade. */
export function defaultNextGrade(outcome: CompletionOutcome | '', grade: GradeLevel): GradeLevel | '' {
  if (outcome === 'RETAINED') return grade;
  if (outcome !== 'PROMOTED') return '';
  const index = GRADE_ORDER.indexOf(grade);
  return GRADE_ORDER[index + 1] ?? '';
}

/** The grades this school offers (at least one class), or every grade when
 * the device has no grade-level data for it. */
export function offeredGrades(
  counts: readonly { gradeLevel: GradeLevel; classCount: number }[] | null,
): GradeLevel[] {
  const offered = new Set((counts ?? []).filter((c) => c.classCount > 0).map((c) => c.gradeLevel));
  return offered.size === 0 ? [...GRADE_ORDER] : GRADE_ORDER.filter((g) => offered.has(g));
}

/** Next-grade choices: the offered grades plus the row's current choice (so a
 * default or recorded grade the school does not teach is never hidden). */
export function nextGradeOptions(offered: readonly GradeLevel[], current: GradeLevel | ''): GradeLevel[] {
  return GRADE_ORDER.filter((g) => offered.includes(g) || g === current);
}

/** The server's rejection lists student ids; show the admin names instead. */
export function nameStudentIds(message: string, rows: readonly CohortRow[]): string {
  // Longest ids first so one id that is a prefix of another cannot split it.
  const byLength = [...rows].sort((a, b) => b.studentId.length - a.studentId.length);
  return byLength.reduce((text, row) => text.replaceAll(row.studentId, studentName(row)), message);
}

export type BuildResult = { ok: true; decisions: CompletionDecision[] } | { ok: false; error: string };

/** The whole visible table's decisions: every row with an outcome chosen.
 * Blank notes are omitted (the save validator rejects ''), Graduated carries
 * no next grade, and Promoted/Retained must have one. */
export function buildDecisions(
  rows: readonly CohortRow[],
  drafts: Readonly<Record<string, OutcomeDraft>>,
): BuildResult {
  const decisions: CompletionDecision[] = [];
  for (const row of rows) {
    const draft = drafts[row.studentId];
    if (!draft || !draft.outcome) continue;
    const decision: CompletionDecision = { studentId: row.studentId, outcome: draft.outcome };
    if (draft.outcome !== 'GRADUATED') {
      if (!draft.nextGradeLevel) return { ok: false, error: `Choose a next grade for ${studentName(row)}.` };
      decision.nextGradeLevel = draft.nextGradeLevel;
    }
    const notes = draft.notes.trim();
    if (notes) decision.notes = notes;
    decisions.push(decision);
  }
  return { ok: true, decisions };
}
