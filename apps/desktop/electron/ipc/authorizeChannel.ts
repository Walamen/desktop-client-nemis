import { ForbiddenError, UnauthorizedError } from '@nemis-desktop/shared';
import { IpcChannels, SystemRole, type IpcChannel } from '@nemis-desktop/types';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';

const PUBLIC_CHANNELS = new Set<IpcChannel>([
  IpcChannels.AUTH_GET_STATUS,
  IpcChannels.AUTH_LOGIN,
  IpcChannels.AUTH_LOGOUT,
  IpcChannels.PROVISIONING_START,
  IpcChannels.SYSTEM_GET_VERSION,
]);

// School-management channels — both the mutations (create/update/delete) and
// the reads that expose the same institution-wide data (dashboard totals,
// full teacher/timetable/enrollment records, etc). Restricted to
// INSTITUTION_ADMIN because none of it is needed by a teacher's own screens.
const SCHOOL_ADMIN_CHANNELS = new Set<IpcChannel>([
  // Mutations
  IpcChannels.ACADEMIC_YEAR_CREATE,
  IpcChannels.ACADEMIC_YEAR_UPDATE,
  IpcChannels.ACADEMIC_YEAR_SET_CURRENT,
  IpcChannels.ACADEMIC_YEAR_SET_STATUS,
  IpcChannels.TERM_CREATE,
  IpcChannels.TERM_UPDATE,
  IpcChannels.TERM_SET_CURRENT,
  IpcChannels.TERM_DELETE,
  IpcChannels.CLASS_CREATE,
  IpcChannels.CLASS_UPDATE,
  IpcChannels.CLASS_SET_ACTIVE,
  IpcChannels.CLASS_SUBJECT_ASSIGN,
  IpcChannels.CLASS_SUBJECT_UNASSIGN,
  IpcChannels.SUBJECT_CREATE,
  IpcChannels.SUBJECT_UPDATE,
  IpcChannels.SUBJECT_SET_ACTIVE,
  IpcChannels.STUDENT_CREATE,
  IpcChannels.STUDENT_UPDATE,
  IpcChannels.STUDENT_SET_ACTIVE,
  IpcChannels.STUDENT_CREATE_GUARDIAN,
  IpcChannels.STUDENT_ENROLL,
  IpcChannels.STUDENT_MOVE_CLASS,
  IpcChannels.TEACHER_CREATE,
  IpcChannels.TEACHER_UPDATE,
  IpcChannels.TEACHER_SET_ACTIVE,
  IpcChannels.TEACHER_ASSIGN,
  IpcChannels.TEACHER_UPDATE_ASSIGNMENT,
  IpcChannels.TEACHER_REMOVE_ASSIGNMENT,
  IpcChannels.TIMETABLE_CREATE,
  IpcChannels.TIMETABLE_UPDATE,
  IpcChannels.TIMETABLE_DELETE,
  IpcChannels.TIMETABLE_COPY,

  // Reads — institution-wide data with no teacher-facing screen behind it.
  IpcChannels.DASHBOARD_GET_OVERVIEW,
  IpcChannels.SCHOOL_GET_SUMMARY,
  IpcChannels.ACADEMIC_YEAR_LIST,
  IpcChannels.TERM_GET_CURRENT,
  IpcChannels.SUBJECT_LIST,
  IpcChannels.CLASS_GRADE_LEVEL_COUNTS,
  IpcChannels.CLASS_SUBJECT_LIST,
  IpcChannels.TEACHER_LIST,
  IpcChannels.TEACHER_GET_PROFILE,
  IpcChannels.TIMETABLE_LIST,
  IpcChannels.TIMETABLE_CLASS,
  IpcChannels.TIMETABLE_SUBJECT,
  IpcChannels.TIMETABLE_DASHBOARD,
  IpcChannels.TIMETABLE_CONFLICTS,
  IpcChannels.STUDENT_GET,
  IpcChannels.STUDENT_LIST_ENROLLMENTS,
  IpcChannels.STUDENT_GET_STATISTICS,
]);

// Reads a teacher's own screens genuinely need, in addition to school
// admins: AttendancePage.tsx loads the class picker (CLASS_LIST) and the
// class roster (STUDENT_LIST) before it can record attendance.
// TEACHER_LIST_ASSIGNMENTS backs the teacher's own dashboard (their classes,
// subjects, homeroom flag) — the handler self-scopes a TEACHER caller to
// their own id, see teacherDirectory.ts. TIMETABLE_TEACHER backs the
// teacher's own Timetable page the same way — see timetables.ts.
// TIMETABLE_PERIODS, ACADEMIC_YEAR_GET_CURRENT and TERM_LIST are structural
// institution-wide data (bell schedule, current year, term list) that the
// Timetable and Gradebook pages need to render — not teacher- or
// class-specific, so none of them need self-scoping.
const SCHOOL_STAFF_CHANNELS = new Set<IpcChannel>([
  IpcChannels.ATTENDANCE_LIST,
  IpcChannels.ATTENDANCE_RECORD,
  IpcChannels.CLASS_LIST,
  IpcChannels.STUDENT_LIST,
  IpcChannels.TEACHER_LIST_ASSIGNMENTS,
  IpcChannels.TIMETABLE_TEACHER,
  IpcChannels.TIMETABLE_PERIODS,
  IpcChannels.ACADEMIC_YEAR_GET_CURRENT,
  IpcChannels.TERM_LIST,
]);

export function authorizeChannel(channel: IpcChannel, workspaces: WorkspaceManager): void {
  if (PUBLIC_CHANNELS.has(channel)) return;
  let role: string;
  try {
    role = workspaces.active.user.role;
  } catch {
    throw new UnauthorizedError('Sign in to unlock an offline workspace.');
  }
  if (SCHOOL_ADMIN_CHANNELS.has(channel) && role !== SystemRole.INSTITUTION_ADMIN) {
    throw new ForbiddenError('This action requires a school administrator workspace.');
  }
  if (
    SCHOOL_STAFF_CHANNELS.has(channel) &&
    role !== SystemRole.INSTITUTION_ADMIN &&
    role !== SystemRole.TEACHER
  ) {
    throw new ForbiddenError('Attendance is only available to school administrators and teachers.');
  }
  // Every other channel (identity, device, settings, sync, generic
  // schoolAdmin records, and TEACHER_GET_DASHBOARD) stays open to any
  // authenticated role — they're either genuinely cross-portal or, in
  // TEACHER_GET_DASHBOARD's case, legitimately used by both the teacher
  // portal and the school-admin dashboard's teacher-list widget.
}
