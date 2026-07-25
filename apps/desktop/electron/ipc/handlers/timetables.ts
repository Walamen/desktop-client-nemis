import { IpcChannels } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertCopyTimetableArgs,
  assertCreateTimetableArgs,
  assertDayOfWeekArg,
  assertListTimetablesArgs,
  assertOptionalIdArgs,
  assertSingleIdArg,
  assertUpdateTimetableArgs,
  assertValidateTimetableArgs,
} from '@app/security/validateIpc';

export function registerTimetableHandlers(handle:IpcHandle,app:ApplicationLayer):void{
  handle(IpcChannels.TIMETABLE_LIST,assertListTimetablesArgs,async r=>(await app.timetables.list(r)).data);
  handle(IpcChannels.TIMETABLE_CLASS,assertSingleIdArg,async id=>(await app.timetables.getClassSchedule(id)).data);
  handle(IpcChannels.TIMETABLE_TEACHER,assertSingleIdArg,async id=>(await app.timetables.getTeacherSchedule(id)).data);
  handle(IpcChannels.TIMETABLE_SUBJECT,assertSingleIdArg,async id=>(await app.timetables.getSubjectSchedule(id)).data);
  handle(IpcChannels.TIMETABLE_CREATE,assertCreateTimetableArgs,async r=>(await app.timetables.create(r)).data);
  handle(IpcChannels.TIMETABLE_UPDATE,assertUpdateTimetableArgs,async r=>(await app.timetables.update(r)).data);
  handle(IpcChannels.TIMETABLE_DELETE,assertSingleIdArg,async id=>(await app.timetables.delete(id)).data);
  handle(IpcChannels.TIMETABLE_COPY,assertCopyTimetableArgs,async r=>(await app.timetables.copy(r)).data);
  handle(IpcChannels.TIMETABLE_VALIDATE,assertValidateTimetableArgs,async r=>(await app.timetables.validate(r)).data);
  handle(IpcChannels.TIMETABLE_CONFLICTS,assertListTimetablesArgs,async r=>(await app.timetables.detectConflicts(r)).data);
  handle(IpcChannels.TIMETABLE_PERIODS,assertOptionalIdArgs,async id=>(await app.timetables.periods(id)).data);
  handle(IpcChannels.TIMETABLE_DASHBOARD,assertDayOfWeekArg,async day=>(await app.timetables.dashboard(day)).data);
}

