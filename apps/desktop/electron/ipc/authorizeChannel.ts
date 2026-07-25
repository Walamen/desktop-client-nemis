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

const SCHOOL_ADMIN_CHANNELS = new Set<IpcChannel>([
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
    (channel === IpcChannels.ATTENDANCE_LIST || channel === IpcChannels.ATTENDANCE_RECORD) &&
    role !== SystemRole.INSTITUTION_ADMIN &&
    role !== SystemRole.TEACHER
  ) {
    throw new ForbiddenError('Attendance is only available to school administrators and teachers.');
  }
}
