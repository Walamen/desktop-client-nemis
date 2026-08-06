import type { AssignmentStatus, AssignmentType, SubmissionStatus } from '@nemis-desktop/types';

export interface CreateAssignmentDto {
  classId: string;
  subjectId?: string;
  teacherId: string;
  title: string;
  type: AssignmentType;
  /** Only DRAFT or ACTIVE — CLOSED is reached later via update. */
  status: AssignmentStatus;
  instructions?: string;
  dueDate: string;
  totalMarks?: number;
  /** Set by the IPC handler after staging a locally-picked file — never
   * supplied directly by a caller that hasn't just copied a real file. */
  attachmentUrl?: string;
  attachmentName?: string;
  /** Renderer-only pass-through: the absolute local path of a file just
   * picked via assignment:pick-attachment. The real use case never reads
   * this — lib/ipc/teacher.ts's IPC facade forwards it onto the wire
   * request, and the electron-side handler consumes it there, staging the
   * file and deriving attachmentUrl/attachmentName before the use case ever
   * runs. Exists here only so the DTO shape both implementations of
   * AssignmentsApplicationService (real and IPC-facade) can share it. */
  attachmentFilePath?: string;
}

export interface UpdateAssignmentDto {
  id: string;
  /** Caller identity, for the ownership check — never written to the row. */
  teacherId: string;
  title?: string;
  subjectId?: string;
  type?: AssignmentType;
  status?: AssignmentStatus;
  instructions?: string;
  dueDate?: string;
  totalMarks?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  /** See CreateAssignmentDto.attachmentFilePath. */
  attachmentFilePath?: string;
}

export interface DeleteAssignmentDto {
  id: string;
  teacherId: string;
}

export interface GetAssignmentDto {
  id: string;
  teacherId: string;
}

export interface ListAssignmentsDto {
  teacherId: string;
  classId?: string;
  status?: AssignmentStatus;
}

export interface AssignmentOutput {
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

export interface ListSubmissionsDto {
  assignmentId: string;
  teacherId: string;
}

export interface GradeSubmissionDto {
  assignmentId: string;
  studentId: string;
  teacherId: string;
  grade: number;
  feedback?: string;
}

/** `id` is null for an enrolled student who has not submitted yet — see
 * IAssignmentSubmissionRepository.listByAssignment. */
export interface AssignmentSubmissionOutput {
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
