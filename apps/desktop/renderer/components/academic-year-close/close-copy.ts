import { GradeLevel, type CompletionOutcome } from '@nemis-desktop/types';

export const OFFLINE_MESSAGE = "You're offline. Connect to the internet to do this.";

export const READINESS_HEADING = 'Before this year can close';
export const FILL_REASON_LABEL = 'Reason for entering this mark';
export const PENDING_CHANGES_MESSAGE =
  'This device has changes that have not reached the server yet. Sync them before closing the year.';

export const confirmCloseCopy = (code: string) =>
  `Close ${code}? Every grade, attendance mark and report card for this year will be frozen. Teachers, students and parents will be notified.`;

const LADDER: readonly GradeLevel[] = Object.values(GradeLevel);
const TERMINAL: GradeLevel = GradeLevel.GRADE_12;

export const gradeLabel = (grade: string) =>
  grade.startsWith('GRADE_') ? `Grade ${grade.slice(6)}` : grade;

/** The grade a student sits in next year for a given outcome (null on graduation). */
export function nextGradeFor(grade: GradeLevel, outcome: CompletionOutcome): GradeLevel | null {
  if (outcome === 'GRADUATED') return null;
  if (outcome === 'RETAINED') return grade;
  return LADDER[LADDER.indexOf(grade) + 1] ?? null;
}

/** Outcomes a student may be given: the terminal grade graduates or repeats,
 * every other grade is promoted or repeats. */
export function outcomesFor(grade: GradeLevel): CompletionOutcome[] {
  return grade === TERMINAL ? ['RETAINED', 'GRADUATED'] : ['PROMOTED', 'RETAINED'];
}

export const OUTCOME_LABEL: Record<CompletionOutcome, string> = {
  PROMOTED: 'Promoted',
  RETAINED: 'Retained',
  GRADUATED: 'Graduated',
};
