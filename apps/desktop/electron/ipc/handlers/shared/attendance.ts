import type { ApplicationLayer } from '@nemis-desktop/application';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertAttendanceListArgs,
  assertRecordAttendanceArgs,
} from '@app/security/validateIpc';

/** Shared between the teacher (recording) and school-admin (reporting)
 * portals — see authorizeChannel.ts, which allows both INSTITUTION_ADMIN and
 * TEACHER on these two channels. */
export function registerAttendanceHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.ATTENDANCE_LIST, assertAttendanceListArgs, async (request) => {
    return (await app.attendance.getByClassAndDate(request)).data;
  });
  handle(IpcChannels.ATTENDANCE_RECORD, assertRecordAttendanceArgs, async (request) => {
    return (await app.attendance.record(request)).data;
  });
}
