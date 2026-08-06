import type { AssignmentsApplicationService, TeacherApplicationService } from '@nemis-desktop/application';
import { teacherBridge } from '@/services/nemis-bridge/teacher';
import { query } from './core';

/** ApplicationLayer pieces the Teacher portal owns for itself: its own
 * dashboard (merged into the shared `teachers` service key by
 * lib/ipc/index.ts, alongside the school-admin staff-directory methods) and
 * the still-unimplemented `assessments` service (gradebook). */
export const teacherIpc = {
  dashboard: (): ReturnType<TeacherApplicationService['dashboard']> =>
    query(() => teacherBridge.getTeacherDashboard()),
};

/** Not wired to any IPC channel yet — grading/gradebook lands here. */
export const teacherAssessments = {};

// `teacherId` on every one of these DTOs exists for the application-layer
// contract (and is re-verified for real inside the electron-side use cases);
// the wire request shapes deliberately don't have that field — the main
// process injects the authenticated caller's own staffId and would reject an
// "unexpected field" if it rode along — so it's stripped here rather than
// forwarded, the same boundary discipline as every other *Request type.
export const assignmentsIpc: Partial<AssignmentsApplicationService> = {
  list: (dto) => query(() => teacherBridge.listAssignments({ classId: dto.classId, status: dto.status })),
  get: (dto) => query(() => teacherBridge.getAssignment(dto.id)),
  create: (dto) =>
    query(() =>
      teacherBridge.createAssignment({
        classId: dto.classId,
        subjectId: dto.subjectId,
        title: dto.title,
        type: dto.type,
        status: dto.status,
        instructions: dto.instructions,
        dueDate: dto.dueDate,
        totalMarks: dto.totalMarks,
        attachmentFilePath: dto.attachmentFilePath,
      }),
    ),
  update: (dto) =>
    query(() =>
      teacherBridge.updateAssignment({
        id: dto.id,
        title: dto.title,
        subjectId: dto.subjectId,
        type: dto.type,
        status: dto.status,
        instructions: dto.instructions,
        dueDate: dto.dueDate,
        totalMarks: dto.totalMarks,
        attachmentFilePath: dto.attachmentFilePath,
      }),
    ),
  remove: (dto) => query(() => teacherBridge.deleteAssignment(dto.id)),
  listSubmissions: (dto) => query(() => teacherBridge.listAssignmentSubmissions(dto.assignmentId)),
  gradeSubmission: (dto) =>
    query(() =>
      teacherBridge.gradeAssignmentSubmission({
        assignmentId: dto.assignmentId,
        studentId: dto.studentId,
        grade: dto.grade,
        feedback: dto.feedback,
      }),
    ),
};
