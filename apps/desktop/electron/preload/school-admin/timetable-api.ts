import { IpcChannels } from '@nemis-desktop/types';
import type { TimetableApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const timetableApi: TimetableApi = {
  list: (request) => invoke(IpcChannels.TIMETABLE_LIST, request),
  getClassSchedule: (id) => invoke(IpcChannels.TIMETABLE_CLASS, id),
  getTeacherSchedule: (id) => invoke(IpcChannels.TIMETABLE_TEACHER, id),
  getSubjectSchedule: (id) => invoke(IpcChannels.TIMETABLE_SUBJECT, id),
  create: (request) => invoke(IpcChannels.TIMETABLE_CREATE, request),
  update: (request) => invoke(IpcChannels.TIMETABLE_UPDATE, request),
  delete: (id) => invoke(IpcChannels.TIMETABLE_DELETE, id),
  copy: (request) => invoke(IpcChannels.TIMETABLE_COPY, request),
  validate: (request) => invoke(IpcChannels.TIMETABLE_VALIDATE, request),
  detectConflicts: (request) => invoke(IpcChannels.TIMETABLE_CONFLICTS, request),
  periods: (classId) => invoke(IpcChannels.TIMETABLE_PERIODS, classId),
  dashboard: (dayOfWeek) => invoke(IpcChannels.TIMETABLE_DASHBOARD, dayOfWeek),
};
