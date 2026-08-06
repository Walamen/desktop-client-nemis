import type { Assignment } from '@nemis-desktop/domain';
import type { AssignmentStatus } from '@nemis-desktop/types';
import type { AssignmentOutput } from '../../dto/assignments/assignment-dto';

export interface AssignmentListFilter {
  teacherId: string;
  classId?: string;
  status?: AssignmentStatus;
}

/** Command side (save/findById/delete) works with the Assignment aggregate.
 * Query side (list/getDetail) returns pre-joined, pre-enriched output rows
 * directly — className/subjectName/submittedCount/totalStudents are derived
 * from other tables and don't belong on the domain aggregate itself. This
 * mirrors ITeacherRepository.listAssignments' read-shape convention. */
export interface IAssignmentRepository {
  save(assignment: Assignment): void;
  findById(id: string): Assignment | null;
  delete(id: string): void;
  list(filter: AssignmentListFilter): AssignmentOutput[];
  getDetail(id: string): AssignmentOutput | null;
}
