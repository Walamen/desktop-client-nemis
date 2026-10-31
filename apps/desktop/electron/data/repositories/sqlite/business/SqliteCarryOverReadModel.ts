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
             -- A child who has since left carries this record to the next school.
             AND EXISTS (
               SELECT 1 FROM enrollments e
               WHERE e.studentId = t.studentId AND e.academicYearId = t.academicYearId
                 AND e.status IN ('ACTIVE', 'SUSPENDED')
             )
           ORDER BY t.createdAt, t.id`,
        )
        .all() as PendingCarryOver[],
    );
  }

  /** Students whose pending matching blocks this period: it ended before they
   * joined, so the grade guard refuses their marks there until it is saved. */
  pendingStudentsFor(gradingPeriodId: string): string[] {
    return guarded('SqliteCarryOverReadModel.pendingStudentsFor', () =>
      (
        this.#repository.connection
          .prepare(
            `SELECT DISTINCT t.studentId FROM transfer_carry_overs t
             JOIN grading_periods p ON p.id = ?
             WHERE t.status = 'PENDING' AND t.academicYearId = p.academicYearId
               AND julianday(p.endDate) < julianday(t.enrolledAt)
             ORDER BY t.studentId`,
          )
          .all(gradingPeriodId) as { studentId: string }[]
      ).map((r) => r.studentId),
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
