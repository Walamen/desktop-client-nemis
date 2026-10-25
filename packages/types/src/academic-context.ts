import type { AcademicYearStatus } from './enums';

/** Where the school is in its calendar right now: the active year, its
 * current term, and the grading period that contains today. Any part can be
 * absent. Backs the "which year am I in" label in the Header. */
export interface AcademicContext {
  year: { id: string; code: string; status: AcademicYearStatus } | null;
  term: { id: string; name: string } | null;
  period: { id: string; name: string } | null;
}
