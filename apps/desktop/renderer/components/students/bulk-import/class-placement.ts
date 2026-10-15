import { grades, human } from '../shared';

// Which class each bulk-imported student is enrolled in. Same rules as
// portal-web's src/lib/student-import-class.ts (Nemis repo); keep them in step.

/** A class a row can be enrolled in: active, current academic year. */
export interface ClassOption {
  id: string;
  name: string;
  gradeLevel: string;
}

export interface ClassPlacement {
  classId: string;
  className: string;
  error: string | null;
}

export const CLASS_HEADER = 'Class';
export const CLASS_COLUMN_NOTE =
  'Optional. The class name as shown on the Classes page. Leave blank to pick automatically when the grade has only one class.';

const PICK_A_CLASS = 'Pick a class';
const KNOWN_GRADES = new Set<string>(grades);
const fold = (s: string) => s.trim().toLowerCase();

/** Spec rules, in order: keep a picked class that fits the grade; else match
 * the file's class name within the grade; else auto-pick the grade's only
 * class. A missing or unknown grade gets no class error — the grade's own
 * error already blocks the row. */
export function resolveRowClass(
  row: { gradeLevel: string; className: string; classId: string },
  classes: readonly ClassOption[],
): ClassPlacement {
  const grade = row.gradeLevel.trim().toUpperCase();
  const typed = row.className.trim();
  if (!KNOWN_GRADES.has(grade)) return { classId: '', className: typed, error: null };

  const ofGrade = classes.filter((c) => c.gradeLevel === grade);
  const kept = ofGrade.find((c) => c.id === row.classId);
  if (kept) return { classId: kept.id, className: kept.name, error: null };

  if (typed) {
    const matches = ofGrade.filter((c) => fold(c.name) === fold(typed));
    const chosen = matches.length > 1 ? matches.filter((c) => c.name.trim() === typed) : matches;
    const only = chosen.length === 1 ? chosen[0] : undefined;
    if (only) return { classId: only.id, className: only.name, error: null };
    if (matches.length > 1) return { classId: '', className: typed, error: PICK_A_CLASS };
    const elsewhere = classes.find((c) => fold(c.name) === fold(typed));
    if (elsewhere) {
      return { classId: '', className: typed, error: `Class "${elsewhere.name}" is ${human(elsewhere.gradeLevel)}, not ${human(grade)}` };
    }
    return { classId: '', className: typed, error: `No ${human(grade)} class named "${typed}" — pick one` };
  }

  const single = ofGrade.length === 1 ? ofGrade[0] : undefined;
  if (single) return { classId: single.id, className: single.name, error: null };
  if (ofGrade.length > 1) return { classId: '', className: '', error: PICK_A_CLASS };
  return { classId: '', className: '', error: `No ${human(grade)} class — create one under Teaching → Classes` };
}

/** Rows with their class resolved and its error (if any) under
 * `errors.classId`. `classes === null` means the list is still loading or
 * failed: rows come back untouched, with no class error, and none is
 * importable — a "create one" message must never fire on a transient failure. */
export function placeRows<
  T extends { gradeLevel: string; className: string; classId: string; errors: Record<string, string> },
>(rows: readonly T[], classes: readonly ClassOption[] | null): T[] {
  if (classes === null) return [...rows];
  return rows.map((row) => {
    const placement = resolveRowClass(row, classes);
    const errors = { ...row.errors };
    delete errors.classId;
    if (placement.error) errors.classId = placement.error;
    return { ...row, classId: placement.classId, className: placement.className, errors };
  });
}

export function isImportable(row: { classId: string; errors: Record<string, string> }): boolean {
  return row.classId !== '' && Object.keys(row.errors).length === 0;
}
