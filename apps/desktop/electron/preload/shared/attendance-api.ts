import { IpcChannels } from '@nemis-desktop/types';
import type { AttendanceApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

/** Shared between the teacher (recording) and school-admin (reporting)
 * portals — see services/nemis-bridge/shared/attendance-bridge.ts. */
export const attendanceApi: AttendanceApi = {
  list: (request) => invoke(IpcChannels.ATTENDANCE_LIST, request),
  record: (request) => invoke(IpcChannels.ATTENDANCE_RECORD, request),
};
