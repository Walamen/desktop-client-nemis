import type { TimetableEntry } from '@nemis-desktop/domain';
import type {
  CopyTimetableRequest,
  PeriodResult,
  ScheduleConflictResult,
  TimetableDashboardResult,
  TimetableEntryResult,
  TimetableListRequest,
} from '@nemis-desktop/types';

export interface TimetablePageFilter extends TimetableListRequest {
  limit: number;
  offset: number;
}

export interface ITimetableRepository {
  findById(id: string): TimetableEntry | null;
  findPage(filter: TimetablePageFilter): { items: TimetableEntryResult[]; total: number };
  save(entry: TimetableEntry): TimetableEntryResult;
  remove(id: string): void;
  hasAssignment(classId: string, subjectId: string, staffId: string): boolean;
  detectConflicts(entry: TimetableEntry, excludeId?: string): ScheduleConflictResult[];
  copy(request: CopyTimetableRequest, ids: readonly string[], now: string): TimetableEntryResult[];
  periods(classId?: string): PeriodResult[];
  dashboard(today: string): TimetableDashboardResult;
}

