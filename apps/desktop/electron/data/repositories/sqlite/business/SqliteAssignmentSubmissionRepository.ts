import { AssignmentSubmission } from '@nemis-desktop/domain';
import type {
  AssignmentSubmissionOutput,
  IAssignmentSubmissionRepository,
} from '@nemis-desktop/application';
import { SubmissionStatus } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface SubmissionRow {
  id: string;
  assignmentId: string;
  studentId: string;
  status: string;
  submittedAt: string | null;
  response: string | null;
  fileUrl: string | null;
  fileName: string | null;
  grade: number | null;
  feedback: string | null;
  updatedAt: string;
}

interface SubmissionListRow {
  submissionId: string | null;
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  status: string;
  submittedAt: string | null;
  response: string | null;
  fileUrl: string | null;
  fileName: string | null;
  grade: number | null;
  feedback: string | null;
}

function toSubmission(row: SubmissionRow): AssignmentSubmission {
  return AssignmentSubmission.of({
    id: row.id,
    assignmentId: row.assignmentId,
    studentId: row.studentId,
    status: row.status as SubmissionStatus,
    submittedAt: row.submittedAt ?? undefined,
    response: row.response ?? undefined,
    fileUrl: row.fileUrl ?? undefined,
    fileName: row.fileName ?? undefined,
    grade: row.grade ?? undefined,
    feedback: row.feedback ?? undefined,
    occurredAt: row.updatedAt,
  });
}

export class SqliteAssignmentSubmissionRepository implements IAssignmentSubmissionRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  saveGrade(submission: AssignmentSubmission): void {
    guarded('SqliteAssignmentSubmissionRepository.saveGrade', () => {
      const now = submission.updatedAt;
      // Natural key (assignmentId, studentId) is the table's UNIQUE
      // constraint — conflicting on it (not `id`) means a submission that
      // arrived via sync-pull with its own id still gets graded in place.
      this.#statements
        .get(
          `INSERT INTO ${TableNames.assignmentSubmissions}
           (id, assignmentId, studentId, status, submittedAt, response, fileUrl, fileName, grade, feedback, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(assignmentId, studentId) DO UPDATE SET
             status = excluded.status,
             submittedAt = excluded.submittedAt,
             grade = excluded.grade,
             feedback = excluded.feedback,
             updatedAt = excluded.updatedAt`,
        )
        .run(
          submission.id,
          submission.assignmentId,
          submission.studentId,
          submission.status,
          submission.submittedAt ?? null,
          submission.response ?? null,
          submission.fileUrl ?? null,
          submission.fileName ?? null,
          submission.grade ?? null,
          submission.feedback ?? null,
          now,
          now,
        );
    });
  }

  findByAssignmentAndStudent(assignmentId: string, studentId: string): AssignmentSubmission | null {
    return guarded('SqliteAssignmentSubmissionRepository.findByAssignmentAndStudent', () => {
      const row = this.#statements
        .get(
          `SELECT id, assignmentId, studentId, status, submittedAt, response, fileUrl, fileName, grade, feedback, updatedAt
           FROM ${TableNames.assignmentSubmissions} WHERE assignmentId = ? AND studentId = ?`,
        )
        .get(assignmentId, studentId) as SubmissionRow | undefined;
      return row ? toSubmission(row) : null;
    });
  }

  listByAssignment(assignmentId: string): AssignmentSubmissionOutput[] {
    return guarded('SqliteAssignmentSubmissionRepository.listByAssignment', () => {
      // Left-joins the class roster against any submission row so a student
      // who never submitted still appears — synthesized PENDING, id null.
      const rows = this.#statements
        .get(
          `SELECT s.id AS submissionId, e.studentId AS studentId,
                  st.firstName, st.lastName, st.admissionNumber,
                  COALESCE(s.status, 'PENDING') AS status,
                  s.submittedAt, s.response, s.fileUrl, s.fileName, s.grade, s.feedback
           FROM enrollments e
           JOIN students st ON st.id = e.studentId
           LEFT JOIN ${TableNames.assignmentSubmissions} s
             ON s.assignmentId = ? AND s.studentId = e.studentId
           WHERE e.classId = (SELECT classId FROM ${TableNames.assignments} WHERE id = ?)
             AND e.status = 'ACTIVE'
           ORDER BY st.lastName ASC`,
        )
        .all(assignmentId, assignmentId) as SubmissionListRow[];
      return rows.map((row) => ({
        id: row.submissionId,
        assignmentId,
        studentId: row.studentId,
        studentName: `${row.firstName} ${row.lastName}`,
        admissionNumber: row.admissionNumber,
        status: row.status as SubmissionStatus,
        submittedAt: row.submittedAt ?? undefined,
        response: row.response ?? undefined,
        fileUrl: row.fileUrl ?? undefined,
        fileName: row.fileName ?? undefined,
        grade: row.grade ?? undefined,
        feedback: row.feedback ?? undefined,
      }));
    });
  }
}
