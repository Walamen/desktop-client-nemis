import type {
  CopyTimetableRequest,
  CreateTimetableEntryRequest,
  TimetableListRequest,
  UpdateTimetableEntryRequest,
  ValidateTimetableRequest,
} from '@nemis-desktop/types';
import { api } from '../api';

export const timetableBridge = {
  listTimetables: (request: TimetableListRequest) => api().timetable.list(request),
  getClassSchedule: (id: string) => api().timetable.getClassSchedule(id),
  getTeacherSchedule: (id: string) => api().timetable.getTeacherSchedule(id),
  getSubjectSchedule: (id: string) => api().timetable.getSubjectSchedule(id),
  createTimetableEntry: (request: CreateTimetableEntryRequest) => api().timetable.create(request),
  updateTimetableEntry: (request: UpdateTimetableEntryRequest) => api().timetable.update(request),
  deleteTimetableEntry: (id: string) => api().timetable.delete(id),
  copyTimetable: (request: CopyTimetableRequest) => api().timetable.copy(request),
  validateTimetable: (request: ValidateTimetableRequest) => api().timetable.validate(request),
  detectTimetableConflicts: (request: TimetableListRequest) => api().timetable.detectConflicts(request),
  getTimetablePeriods: (classId?: string) => api().timetable.periods(classId),
  getTimetableDashboard: (dayOfWeek: string) => api().timetable.dashboard(dayOfWeek),
};
