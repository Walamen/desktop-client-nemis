import { Assignment } from '@nemis-desktop/domain';
import type {
  AssignmentListFilter,
  AssignmentOutput,
  IAssignmentRepository,
} from '@nemis-desktop/application';
import { AssignmentStatus, AssignmentType } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface AssignmentRow {
  id: string;
  classId: string;
  subjectId: string | null;
  teacherId: string;
  title: string;
  type: string;
  status: string;
  instructions: string | null;
  dueDate: string;
  totalMarks: number | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  updatedAt: string;
}

interface AssignmentOutputRow extends AssignmentRow {
  className: string;
  subjectName: string | null;
  createdAt: string;
  submittedCount: number;
  totalStudents: number;
}

function toAssignment(row: AssignmentRow): Assignment {
  return Assignment.create({
    id: row.id,
    classId: row.classId,
    subjectId: row.subjectId ?? undefined,
    teacherId: row.teacherId,
    title: row.title,
    type: row.type as AssignmentType,
    status: row.status as AssignmentStatus,
    instructions: row.instructions ?? undefined,
    dueDate: row.dueDate,
    totalMarks: row.totalMarks ?? undefined,
    attachmentUrl: row.attachmentUrl ?? undefined,
    attachmentName: row.attachmentName ?? undefined,
    occurredAt: row.updatedAt,
  });
}

function toOutput(row: AssignmentOutputRow): AssignmentOutput {
  return {
    id: row.id,
    classId: row.classId,
    className: row.className,
    subjectId: row.subjectId ?? undefined,
    subjectName: row.subjectName ?? undefined,
    teacherId: row.teacherId,
    title: row.title,
    type: row.type as AssignmentType,
    status: row.status as AssignmentStatus,
    instructions: row.instructions ?? undefined,
    dueDate: row.dueDate,
    totalMarks: row.totalMarks ?? undefined,
    attachmentUrl: row.attachmentUrl ?? undefined,
    attachmentName: row.attachmentName ?? undefined,
    submittedCount: row.submittedCount,
    totalStudents: row.totalStudents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// submittedCount/totalStudents are computed here rather than in the use case
// because they're a join-derived, read-only view concern — matching how
// SqliteTeacherRepository.listAssignments bakes className/subjectName into
// its output rows directly.
const OUTPUT_SELECT = `
  SELECT
    a.id, a.classId, c.name AS className, a.subjectId, sub.name AS subjectName, a.teacherId,
    a.title, a.type, a.status, a.instructions, a.dueDate, a.totalMarks,
    a.attachmentUrl, a.attachmentName, a.createdAt, a.updatedAt,
    (SELECT COUNT(*) FROM ${TableNames.assignmentSubmissions} s
      WHERE s.assignmentId = a.id AND s.status <> 'PENDING') AS submittedCount,
    (SELECT COUNT(*) FROM enrollments e
      WHERE e.classId = a.classId AND e.status = 'ACTIVE') AS totalStudents
  FROM ${TableNames.assignments} a
  JOIN classes c ON c.id = a.classId
  LEFT JOIN subjects sub ON sub.id = a.subjectId
`;

export class SqliteAssignmentRepository implements IAssignmentRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  save(assignment: Assignment): void {
    guarded('SqliteAssignmentRepository.save', () => {
      const now = assignment.updatedAt;
      this.#statements
        .get(
          `INSERT INTO ${TableNames.assignments}
           (id, classId, subjectId, teacherId, title, type, status, instructions, dueDate, totalMarks, attachmentUrl, attachmentName, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             subjectId = excluded.subjectId,
             title = excluded.title,
             type = excluded.type,
             status = excluded.status,
             instructions = excluded.instructions,
             dueDate = excluded.dueDate,
             totalMarks = excluded.totalMarks,
             attachmentUrl = excluded.attachmentUrl,
             attachmentName = excluded.attachmentName,
             updatedAt = excluded.updatedAt`,
        )
        .run(
          assignment.id,
          assignment.classId,
          assignment.subjectId ?? null,
          assignment.teacherId,
          assignment.title,
          assignment.type,
          assignment.status,
          assignment.instructions ?? null,
          assignment.dueDate,
          assignment.totalMarks ?? null,
          assignment.attachmentUrl ?? null,
          assignment.attachmentName ?? null,
          now,
          now,
        );
    });
  }

  findById(id: string): Assignment | null {
    return guarded('SqliteAssignmentRepository.findById', () => {
      const row = this.#statements
        .get(
          `SELECT id, classId, subjectId, teacherId, title, type, status, instructions, dueDate,
                  totalMarks, attachmentUrl, attachmentName, updatedAt
           FROM ${TableNames.assignments} WHERE id = ?`,
        )
        .get(id) as AssignmentRow | undefined;
      return row ? toAssignment(row) : null;
    });
  }

  delete(id: string): void {
    guarded('SqliteAssignmentRepository.delete', () => {
      this.#statements.get(`DELETE FROM ${TableNames.assignments} WHERE id = ?`).run(id);
    });
  }

  list(filter: AssignmentListFilter): AssignmentOutput[] {
    return guarded('SqliteAssignmentRepository.list', () => {
      let sql = `${OUTPUT_SELECT} WHERE a.teacherId = ?`;
      const params: unknown[] = [filter.teacherId];
      if (filter.classId) {
        sql += ' AND a.classId = ?';
        params.push(filter.classId);
      }
      if (filter.status) {
        sql += ' AND a.status = ?';
        params.push(filter.status);
      }
      sql += ' ORDER BY a.createdAt DESC';
      const rows = this.#statements.get(sql).all(...params) as AssignmentOutputRow[];
      return rows.map(toOutput);
    });
  }

  getDetail(id: string): AssignmentOutput | null {
    return guarded('SqliteAssignmentRepository.getDetail', () => {
      const row = this.#statements.get(`${OUTPUT_SELECT} WHERE a.id = ?`).get(id) as
        | AssignmentOutputRow
        | undefined;
      return row ? toOutput(row) : null;
    });
  }
}
