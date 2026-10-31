import type { CarriedGradeCell, PendingCarryOver } from '@nemis-desktop/types';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

/** Stage 5: the school's "Match prior record" tasks still waiting, from the
 * pulled transfer_carry_overs rows. Only the ACTIVE year's: a task of a year
 * already closed can no longer be acted on. Works offline (dashboard card,
 * student profile banner); the matching itself is online. */
export class SqliteCarryOverReadModel {
  readonly #repository: Pick<RepositoryContext, 'connection'>;

  constructor(repository: Pick<RepositoryContext, 'connection'>) {
    this.#repository = repository;
  }

  listPending(): PendingCarryOver[] {
    return guarded('SqliteCarryOverReadModel.listPending', () =>
      this.#repository.connection
        .prepare(
          `SELECT t.id, t.studentId,
                  TRIM(COALESCE(s.firstName, '') || ' ' || COALESCE(s.lastName, '')) AS studentName,
                  t.fromInstitutionName, t.createdAt
           FROM transfer_carry_overs t
           JOIN academic_years y ON y.id = t.academicYearId
           LEFT JOIN students s ON s.id = t.studentId
           WHERE t.status = 'PENDING' AND y.status = 'ACTIVE'
           ORDER BY t.createdAt, t.id`,
        )
        .all() as PendingCarryOver[],
    );
  }

  /** Carried marks filling (period, subject) cells: read-only in the grade grid. */
  carriedFor(gradingPeriodId: string, subjectId: string): CarriedGradeCell[] {
    return guarded('SqliteCarryOverReadModel.carriedFor', () =>
      this.#repository.connection
        .prepare(
          `SELECT studentId, percentage, sourceSchoolName FROM carried_grades
           WHERE targetGradingPeriodId = ? AND targetSubjectId = ?
           ORDER BY studentId`,
        )
        .all(gradingPeriodId, subjectId) as CarriedGradeCell[],
    );
  }
}
