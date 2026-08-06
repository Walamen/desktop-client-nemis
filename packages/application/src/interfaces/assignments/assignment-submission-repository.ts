import type { AssignmentSubmission } from '@nemis-desktop/domain';
import type { AssignmentSubmissionOutput } from '../../dto/assignments/assignment-dto';

export interface IAssignmentSubmissionRepository {
  saveGrade(submission: AssignmentSubmission): void;
  findByAssignmentAndStudent(assignmentId: string, studentId: string): AssignmentSubmission | null;
  /** One row per actively-enrolled student in the assignment's class,
   * left-joined against any submission they've made — a student with no
   * submission row still appears, synthesized as PENDING (id: null).
   * Mirrors the web backend's listSubmissions(). */
  listByAssignment(assignmentId: string): AssignmentSubmissionOutput[];
}
