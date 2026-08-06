import type { StatusPresentation } from '../../presenters/status-presentation';

export interface AssignmentRowView {
  readonly id: string;
  readonly title: string;
  readonly classId: string;
  readonly className: string;
  readonly subjectId?: string;
  readonly subjectName?: string;
  readonly dueDate: string;
  readonly status: StatusPresentation;
  readonly submittedCount: number;
  readonly totalStudents: number;
}

export interface AssignmentDetailView extends AssignmentRowView {
  readonly type: string;
  readonly instructions?: string;
  readonly totalMarks?: number;
  readonly attachmentUrl?: string;
  readonly attachmentName?: string;
  readonly createdAt: string;
}

export interface AssignmentSubmissionRowView {
  readonly id: string | null;
  readonly assignmentId: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly admissionNumber: string;
  readonly status: StatusPresentation;
  readonly submittedAt?: string;
  readonly response?: string;
  readonly fileUrl?: string;
  readonly fileName?: string;
  readonly grade?: number;
  readonly feedback?: string;
}
