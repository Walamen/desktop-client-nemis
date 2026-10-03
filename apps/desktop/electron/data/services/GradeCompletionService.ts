import { randomUUID } from 'node:crypto';
import { ForbiddenError, IPCError } from '@nemis-desktop/shared';
import {
  DesktopScopeType,
  SystemRole,
  type CohortResult,
  type CohortRow,
  type DiscardCompletionResult,
  type CompletionDecision,
  type GradeLevel,
  type SaveCompletionsRequest,
  type SaveCompletionsResult,
} from '@nemis-desktop/types';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';

type Db = WorkspaceManager['active']['database']['connection'];

/** GRADUATED carries no next grade; every other outcome must name one.
 * Same rule as the server's `assertDecisionShape` (enrollments.service.ts),
 * so a decision saved here is never refused at push for its shape. */
export function assertCompletionDecisionShape(decision: CompletionDecision): void {
  if (decision.outcome === 'GRADUATED') {
    if (decision.nextGradeLevel) {
      throw new IPCError(
        `Student ${decision.studentId}: a GRADUATED outcome must not carry a next grade.`,
      );
    }
    return;
  }
  if (!decision.nextGradeLevel) {
    throw new IPCError(
      `Student ${decision.studentId}: a next grade is required for ${decision.outcome}.`,
    );
  }
}

/**
 * End-of-year outcomes, local side (NEMIS ID desktop parity, Stage 5).
 *
 * Reads the cohort from local SQLite and records the admin's decisions as
 * `pending` rows of `grade_completions`; GradeCompletionSyncService pushes
 * them. D7: nothing here touches `students` or `enrollments` — the server
 * moves the live grade and closes enrolments when it accepts a stamp, and the
 * pull brings that back. `grade_completions` has no outbox trigger, so these
 * writes never reach `sync_queue`.
 */
export class GradeCompletionService {
  constructor(private readonly workspaces: WorkspaceManager) {}

  getCohort(academicYearId: string, gradeLevel: GradeLevel): CohortResult {
    const { db, institutionId } = this.context();
    const ids = cohortCandidates(db, institutionId, academicYearId, gradeLevel);

    const rows = db
      .prepare(
        `SELECT s.id studentId, s.firstName, s.lastName, s.nemisId,
                gc.outcome, gc.nextGradeLevel, gc.notes, gc.syncState, gc.syncError
           FROM students s
           LEFT JOIN grade_completions gc
             ON gc.studentId = s.id AND gc.academicYearId = ? AND gc.gradeLevel = ?
            AND gc.institutionId = ?
          WHERE s.id IN (SELECT value FROM json_each(?))
          ORDER BY s.lastName, s.firstName, s.id`,
      )
      .all(academicYearId, gradeLevel, institutionId, JSON.stringify(ids.cohort)) as CohortRow[];

    // A count, never a widening (server: "notMissing" = cohort ∪
    // stamped-at-another-grade, which is exactly the candidate set). Unlike
    // the cohort this IS limited to active students currently at this school.
    const { unenrolledCount } = db
      .prepare(
        `SELECT COUNT(*) unenrolledCount FROM students
          WHERE institutionId = ? AND gradeLevel = ? AND isActive = 1
            AND id NOT IN (SELECT value FROM json_each(?))`,
      )
      .get(institutionId, gradeLevel, JSON.stringify(ids.candidates)) as {
      unenrolledCount: number;
    };

    return { rows, unenrolledCount };
  }

  save(request: SaveCompletionsRequest): SaveCompletionsResult {
    const { db, institutionId, userId } = this.context();
    const { academicYearId, gradeLevel, decisions } = request;

    const seen = new Set<string>();
    for (const decision of decisions) {
      assertCompletionDecisionShape(decision);
      if (seen.has(decision.studentId)) {
        throw new IPCError(`Student ${decision.studentId} appears more than once.`);
      }
      seen.add(decision.studentId);
    }

    const year = db
      .prepare(`SELECT id FROM academic_years WHERE id = ? AND institutionId = ?`)
      .get(academicYearId, institutionId);
    if (!year) throw new IPCError('Academic year not found for this school.');

    // Membership is the cohort the screen showed; anyone else (stamped at
    // another grade, not enrolled, unknown) would make the server refuse the
    // whole group at push, so refuse here, naming every offender.
    const cohort = new Set(
      cohortCandidates(db, institutionId, academicYearId, gradeLevel).cohort,
    );
    const outsiders = decisions.map((d) => d.studentId).filter((id) => !cohort.has(id));
    if (outsiders.length > 0) {
      throw new IPCError(
        `One or more students are not in this cohort: ${outsiders.join(', ')}`,
      );
    }

    const findExisting = db.prepare(
      `SELECT id, outcome, nextGradeLevel, notes, syncState FROM grade_completions
        WHERE studentId = ? AND academicYearId = ?`,
    );
    const insert = db.prepare(
      `INSERT INTO grade_completions
         (id, studentId, institutionId, academicYearId, gradeLevel, outcome, nextGradeLevel,
          averageAtDecision, notes, decidedBy, createdAt, updatedAt, syncState, syncError)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'pending', NULL)`,
    );
    const update = db.prepare(
      `UPDATE grade_completions
          SET outcome = ?, nextGradeLevel = ?, notes = ?, amendedBy = ?, amendedAt = ?,
              updatedAt = ?, syncState = 'pending', syncError = NULL
        WHERE id = ?`,
    );

    let saved = 0;
    db.transaction(() => {
      const now = new Date().toISOString();
      for (const decision of decisions) {
        const nextGradeLevel = decision.nextGradeLevel ?? null;
        // An absent note and a stored null are the same thing (server rule).
        const notes = decision.notes ?? null;
        const existing = findExisting.get(decision.studentId, academicYearId) as
          | {
              id: string;
              outcome: string;
              nextGradeLevel: string | null;
              notes: string | null;
              syncState: string;
            }
          | undefined;
        // A rejected row is never "unchanged": the server refuses a whole
        // (year, grade) group, so every row of it is marked rejected, and the
        // ones the admin did not edit must be re-queued with the fixed one.
        if (
          existing &&
          existing.syncState !== 'rejected' &&
          existing.outcome === decision.outcome &&
          existing.nextGradeLevel === nextGradeLevel &&
          existing.notes === notes
        ) {
          continue;
        }
        if (existing) {
          update.run(decision.outcome, nextGradeLevel, notes, userId, now, now, existing.id);
        } else {
          insert.run(
            randomUUID(),
            decision.studentId,
            institutionId,
            academicYearId,
            gradeLevel,
            decision.outcome,
            nextGradeLevel,
            notes,
            userId,
            now,
            now,
          );
        }
        saved += 1;
      }
    })();
    return { saved };
  }

  /**
   * Drops this student's local decision for that year, but only one the
   * server has not accepted (`pending` or `rejected`) — e.g. a row made
   * permanently invalid by a web-side stamp at another grade, which the pull
   * never overwrites and which would otherwise refuse its group on every
   * push. A synced row is the server's record and is never deleted here.
   */
  discard(academicYearId: string, studentId: string): DiscardCompletionResult {
    const { db, institutionId } = this.context();
    const result = db
      .prepare(
        `DELETE FROM grade_completions
          WHERE studentId = ? AND academicYearId = ? AND institutionId = ?
            AND syncState IN ('pending', 'rejected')`,
      )
      .run(studentId, academicYearId, institutionId);
    return { discarded: result.changes > 0 };
  }

  private context(): { db: Db; institutionId: string; userId: string } {
    const active = this.workspaces.active;
    if (
      active.user.role !== SystemRole.INSTITUTION_ADMIN ||
      active.user.scope.type !== DesktopScopeType.INSTITUTION
    ) {
      throw new ForbiddenError('Only a school administrator can record end-of-year outcomes.');
    }
    const institutionId =
      active.user.institutionId ?? active.user.scope.institutionId ?? active.user.scope.scopeId;
    return { db: active.database.connection, institutionId, userId: active.user.id };
  }
}

/**
 * Mirrors the server's `EnrollmentsService.getCohortForCompletion`:
 * enrolment that year in this school's classes at that grade (one row per
 * term, so deduplicated; status deliberately unfiltered — COMPLETED is normal
 * once outcomes are recorded) ∪ this school's stamps at that year and grade,
 * minus anyone stamped that year at a different grade (unique per student and
 * year, so they cannot take a second stamp). No `isActive` filter and no
 * filter on the student's current school: a child who left mid-year is
 * precisely who most needs a stamp, and membership is already scoped by
 * `classes.institutionId`.
 *
 * `candidates` is the union before the subtraction — the server's
 * `notMissing` set used by `unenrolledCount`.
 */
function cohortCandidates(
  db: Db,
  institutionId: string,
  academicYearId: string,
  gradeLevel: GradeLevel,
): { candidates: string[]; cohort: string[] } {
  // Restricted to students held locally, as the server's final student
  // lookup is: grade_completions has no FK, and a stamp for a child the
  // snapshot does not carry has no name to show or decide on.
  const candidates = (
    db
      .prepare(
        `SELECT id studentId FROM students WHERE id IN (
           SELECT e.studentId FROM enrollments e
             JOIN classes c ON c.id = e.classId
            WHERE e.academicYearId = ? AND c.institutionId = ? AND c.gradeLevel = ?
           UNION
           SELECT studentId FROM grade_completions
            WHERE academicYearId = ? AND gradeLevel = ? AND institutionId = ?
         )`,
      )
      .all(academicYearId, institutionId, gradeLevel, academicYearId, gradeLevel, institutionId) as {
      studentId: string;
    }[]
  ).map((row) => row.studentId);

  const stampedElsewhere = new Set(
    (
      db
        .prepare(
          `SELECT studentId FROM grade_completions
            WHERE academicYearId = ? AND gradeLevel <> ?
              AND studentId IN (SELECT value FROM json_each(?))`,
        )
        .all(academicYearId, gradeLevel, JSON.stringify(candidates)) as { studentId: string }[]
    ).map((row) => row.studentId),
  );

  return { candidates, cohort: candidates.filter((id) => !stampedElsewhere.has(id)) };
}
