import type {
  CopyTimetableRequest,
  CreateTimetableEntryRequest,
  PeriodResult,
  ScheduleConflictResult,
  TimetableDashboardResult,
  TimetableEntryResult,
  TimetableListRequest,
  TimetablePageResult,
  UpdateTimetableEntryRequest,
  ValidateTimetableRequest,
} from '@nemis-desktop/types';
import type { ApplicationResponse } from '../core/response';
import type {
  CopyTimetable,
  CreateTimetable,
  DeleteTimetable,
  DetectScheduleConflicts,
  GetTimetableDashboard,
  GetTimetablePeriods,
  SearchTimetables,
  UpdateTimetable,
  ValidateTimetable,
} from '../use-cases/timetables/timetable-use-cases';

export interface TimetableApplicationServiceDeps {
  create: CreateTimetable;
  update: UpdateTimetable;
  delete: DeleteTimetable;
  copy: CopyTimetable;
  search: SearchTimetables;
  validate: ValidateTimetable;
  conflicts: DetectScheduleConflicts;
  periods: GetTimetablePeriods;
  dashboard: GetTimetableDashboard;
}

export class TimetableApplicationService {
  constructor(private readonly deps: TimetableApplicationServiceDeps) {}
  create(dto: CreateTimetableEntryRequest): Promise<ApplicationResponse<TimetableEntryResult>> { return this.deps.create.execute(dto); }
  update(dto: UpdateTimetableEntryRequest): Promise<ApplicationResponse<TimetableEntryResult>> { return this.deps.update.execute(dto); }
  delete(id: string): Promise<ApplicationResponse<{ id: string }>> { return this.deps.delete.execute(id); }
  copy(dto: CopyTimetableRequest): Promise<ApplicationResponse<TimetableEntryResult[]>> { return this.deps.copy.execute(dto); }
  list(dto: TimetableListRequest): Promise<ApplicationResponse<TimetablePageResult>> { return this.deps.search.execute(dto); }
  getClassSchedule(classId: string): Promise<ApplicationResponse<TimetablePageResult>> { return this.deps.search.execute({ classId, limit: 10_000, sort: 'day' }); }
  getTeacherSchedule(teacherId: string): Promise<ApplicationResponse<TimetablePageResult>> { return this.deps.search.execute({ teacherId, limit: 10_000, sort: 'day' }); }
  getSubjectSchedule(subjectId: string): Promise<ApplicationResponse<TimetablePageResult>> { return this.deps.search.execute({ subjectId, limit: 10_000, sort: 'day' }); }
  validate(dto: ValidateTimetableRequest): Promise<ApplicationResponse<ScheduleConflictResult[]>> { return this.deps.validate.execute(dto); }
  detectConflicts(dto: TimetableListRequest = {}): Promise<ApplicationResponse<ScheduleConflictResult[]>> { return this.deps.conflicts.execute(dto); }
  periods(classId?: string): Promise<ApplicationResponse<PeriodResult[]>> { return this.deps.periods.execute(classId); }
  dashboard(dayOfWeek: string): Promise<ApplicationResponse<TimetableDashboardResult>> { return this.deps.dashboard.execute(dayOfWeek); }
}

