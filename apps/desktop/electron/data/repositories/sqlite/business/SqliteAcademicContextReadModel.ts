import type { AcademicContext, AcademicYearStatus } from '@nemis-desktop/types';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

/** The Header's "which year am I in" label: the school's active year, that
 * year's current term, and the grading period containing `today` (an ISO
 * date, YYYY-MM-DD). A part is null when there is nothing to show for it.
 * `institutionId` null (no provisioning metadata yet) leaves the year
 * unscoped, as workspaceStudentScope does. */
export class SqliteAcademicContextReadModel {
  readonly #repository: Pick<RepositoryContext, 'connection'>;

  constructor(repository: Pick<RepositoryContext, 'connection'>) {
    this.#repository = repository;
  }

  get(institutionId: string | null, today: string): AcademicContext {
    return guarded('SqliteAcademicContextReadModel.get', () => {
      const db = this.#repository.connection;
      const year = db
        .prepare(
          `SELECT id, code, status FROM academic_years
           WHERE isCurrent = 1 AND (? IS NULL OR institutionId = ?)
           ORDER BY startDate DESC, id LIMIT 1`,
        )
        .get(institutionId, institutionId) as { id: string; code: string; status: AcademicYearStatus } | undefined;
      if (!year) return { year: null, term: null, period: null };

      const term = db
        .prepare(`SELECT id, name FROM terms WHERE academicYearId = ? AND isCurrent = 1 ORDER BY startDate DESC, id LIMIT 1`)
        .get(year.id) as { id: string; name: string } | undefined;
      const period = term
        ? (db
            .prepare(
              `SELECT id, name FROM grading_periods
               WHERE termId = ? AND startDate <= ? AND ? <= endDate
               ORDER BY sequence, id LIMIT 1`,
            )
            .get(term.id, today, today) as { id: string; name: string } | undefined)
        : undefined;
      return { year, term: term ?? null, period: period ?? null };
    });
  }
}
