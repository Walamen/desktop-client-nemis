import type { TeacherApplicationService } from '@nemis-desktop/application';
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
