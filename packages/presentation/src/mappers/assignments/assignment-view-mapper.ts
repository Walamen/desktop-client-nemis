import type { AssignmentOutput, AssignmentSubmissionOutput } from '@nemis-desktop/application';
import { formatIsoDate, formatIsoDateTime } from '../../formatters/format-date';
import { presentAssignmentStatus, presentSubmissionStatus } from '../../presenters/present-status';
import type {
  AssignmentDetailView,
  AssignmentRowView,
  AssignmentSubmissionRowView,
} from '../../view-models/assignments/assignment-views';

export function toAssignmentRowView(dto: AssignmentOutput): AssignmentRowView {
  return {
    id: dto.id,
    title: dto.title,
    classId: dto.classId,
    className: dto.className,
    subjectId: dto.subjectId,
    subjectName: dto.subjectName,
    dueDate: formatIsoDate(dto.dueDate),
    status: presentAssignmentStatus(dto.status),
    submittedCount: dto.submittedCount,
    totalStudents: dto.totalStudents,
  };
}

export function toAssignmentDetailView(dto: AssignmentOutput): AssignmentDetailView {
  return {
    ...toAssignmentRowView(dto),
    type: dto.type,
    instructions: dto.instructions,
    totalMarks: dto.totalMarks,
    attachmentUrl: dto.attachmentUrl,
    attachmentName: dto.attachmentName,
    createdAt: formatIsoDate(dto.createdAt),
  };
}

export function toAssignmentSubmissionRowView(
  dto: AssignmentSubmissionOutput,
): AssignmentSubmissionRowView {
  return {
    id: dto.id,
    assignmentId: dto.assignmentId,
    studentId: dto.studentId,
    studentName: dto.studentName,
    admissionNumber: dto.admissionNumber,
    status: presentSubmissionStatus(dto.status),
    submittedAt: dto.submittedAt ? formatIsoDateTime(dto.submittedAt) : undefined,
    response: dto.response,
    fileUrl: dto.fileUrl,
    fileName: dto.fileName,
    grade: dto.grade,
    feedback: dto.feedback,
  };
}
