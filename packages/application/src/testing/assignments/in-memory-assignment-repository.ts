import type { Assignment } from '@nemis-desktop/domain';
import type {
  AssignmentListFilter,
  IAssignmentRepository,
} from '../../interfaces/assignments/assignment-repository';
import type { AssignmentOutput } from '../../dto/assignments/assignment-dto';

/** Deterministic placeholder joins (className/subjectName/totalStudents) —
 * good enough for exercising use-case workflow logic. Real join correctness
 * is covered by SqliteAssignmentRepository's integration tests. */
export class InMemoryAssignmentRepository implements IAssignmentRepository {
  readonly store = new Map<string, Assignment>();
  submittedCountByAssignment = new Map<string, number>();
  totalStudentsByClass = new Map<string, number>();

  save(assignment: Assignment): void {
    this.store.set(assignment.id, assignment);
  }

  findById(id: string): Assignment | null {
    return this.store.get(id) ?? null;
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  list(filter: AssignmentListFilter): AssignmentOutput[] {
    return [...this.store.values()]
      .filter((a) => a.teacherId === filter.teacherId)
      .filter((a) => !filter.classId || a.classId === filter.classId)
      .filter((a) => !filter.status || a.status === filter.status)
      .map((a) => this.toOutput(a));
  }

  getDetail(id: string): AssignmentOutput | null {
    const assignment = this.store.get(id);
    return assignment ? this.toOutput(assignment) : null;
  }

  private toOutput(a: Assignment): AssignmentOutput {
    return {
      id: a.id,
      classId: a.classId,
      className: `Class ${a.classId}`,
      subjectId: a.subjectId,
      subjectName: a.subjectId ? `Subject ${a.subjectId}` : undefined,
      teacherId: a.teacherId,
      title: a.title,
      type: a.type,
      status: a.status,
      instructions: a.instructions,
      dueDate: a.dueDate,
      totalMarks: a.totalMarks,
      attachmentUrl: a.attachmentUrl,
      attachmentName: a.attachmentName,
      submittedCount: this.submittedCountByAssignment.get(a.id) ?? 0,
      totalStudents: this.totalStudentsByClass.get(a.classId) ?? 0,
      createdAt: a.updatedAt,
      updatedAt: a.updatedAt,
    };
  }
}
