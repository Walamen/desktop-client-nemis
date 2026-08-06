import type { AssignmentSubmission } from '@nemis-desktop/domain';
import { SubmissionStatus } from '@nemis-desktop/types';
import type { IAssignmentSubmissionRepository } from '../../interfaces/assignments/assignment-submission-repository';
import type { AssignmentSubmissionOutput } from '../../dto/assignments/assignment-dto';

interface EnrolledStudent {
  studentId: string;
  studentName: string;
  admissionNumber: string;
}

/** Enrollment roster is injected because this fake has no `enrollments`
 * table to join against — tests seed `enrolledStudentsByAssignment` for the
 * PENDING-synthesis behaviour they care about. */
export class InMemoryAssignmentSubmissionRepository implements IAssignmentSubmissionRepository {
  readonly store = new Map<string, AssignmentSubmission>();
  enrolledStudentsByAssignment = new Map<string, EnrolledStudent[]>();

  saveGrade(submission: AssignmentSubmission): void {
    this.store.set(submission.id, submission);
  }

  findByAssignmentAndStudent(assignmentId: string, studentId: string): AssignmentSubmission | null {
    for (const submission of this.store.values()) {
      if (submission.assignmentId === assignmentId && submission.studentId === studentId) {
        return submission;
      }
    }
    return null;
  }

  listByAssignment(assignmentId: string): AssignmentSubmissionOutput[] {
    const roster = this.enrolledStudentsByAssignment.get(assignmentId) ?? [];
    const byStudent = new Map(
      [...this.store.values()]
        .filter((s) => s.assignmentId === assignmentId)
        .map((s) => [s.studentId, s] as const),
    );
    return roster.map((student) => {
      const submission = byStudent.get(student.studentId);
      return {
        id: submission?.id ?? null,
        assignmentId,
        studentId: student.studentId,
        studentName: student.studentName,
        admissionNumber: student.admissionNumber,
        status: submission?.status ?? SubmissionStatus.PENDING,
        submittedAt: submission?.submittedAt,
        response: submission?.response,
        fileUrl: submission?.fileUrl,
        fileName: submission?.fileName,
        grade: submission?.grade,
        feedback: submission?.feedback,
      };
    });
  }
}
