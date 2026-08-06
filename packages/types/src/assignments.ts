import type { AssignmentStatus, AssignmentType, SubmissionStatus } from './enums';

export interface AssignmentResult {
  id: string;
  classId: string;
  className: string;
  subjectId?: string;
  subjectName?: string;
  teacherId: string;
  title: string;
  type: AssignmentType;
  status: AssignmentStatus;
  instructions?: string;
  dueDate: string;
  totalMarks?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  submittedCount: number;
  totalStudents: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListAssignmentsRequest {
  classId?: string;
  status?: AssignmentStatus;
}

export interface CreateAssignmentRequest {
  classId: string;
  subjectId?: string;
  title: string;
  type: AssignmentType;
  /** Only DRAFT or ACTIVE — CLOSED is reached later via update. */
  status: AssignmentStatus;
  instructions?: string;
  dueDate: string;
  totalMarks?: number;
  /** Absolute local path of a file just picked via assignment:pick-attachment
   * — the main process stages it into workspace storage and derives the
   * actual attachmentUrl/attachmentName; never set this to anything else. */
  attachmentFilePath?: string;
}

export interface UpdateAssignmentRequest {
  id: string;
  title?: string;
  subjectId?: string;
  type?: AssignmentType;
  status?: AssignmentStatus;
  instructions?: string;
  dueDate?: string;
  totalMarks?: number;
  attachmentFilePath?: string;
}

export interface PickAttachmentResult {
  path: string;
  name: string;
  size: number;
}

/** `id` is null for an enrolled student who has not submitted yet — a
 * synthesized PENDING placeholder, not a real submission row. Mirrors the
 * web backend's listSubmissions(), which returns one row per active
 * enrollment regardless of whether the student has submitted. */
export interface AssignmentSubmissionResult {
  id: string | null;
  assignmentId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  status: SubmissionStatus;
  submittedAt?: string;
  response?: string;
  fileUrl?: string;
  fileName?: string;
  grade?: number;
  feedback?: string;
}

export interface GradeSubmissionRequest {
  assignmentId: string;
  studentId: string;
  grade: number;
  feedback?: string;
}
