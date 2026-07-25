import type { DayOfWeek, GradeLevel } from './enums';

export interface TimetableEntryResult {
  id: string;
  institutionId: string;
  classId: string;
  subjectId?: string;
  staffId?: string;
  assignmentId?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  room?: string;
  isBreak: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  academicYearId: string;
  academicYearName: string;
  className: string;
  section?: string;
  gradeLevel: GradeLevel;
  subjectName?: string;
  subjectCode?: string;
  teacherName?: string;
  employeeNumber?: string;
}

export interface CreateTimetableEntryRequest {
  institutionId: string;
  classId: string;
  subjectId?: string;
  staffId?: string;
  assignmentId?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  room?: string;
  isBreak?: boolean;
}

export interface UpdateTimetableEntryRequest
  extends Partial<Omit<CreateTimetableEntryRequest, 'institutionId'>> {
  id: string;
}

export interface TimetableListRequest {
  limit?: number;
  offset?: number;
  keyword?: string;
  academicYearId?: string;
  classId?: string;
  teacherId?: string;
  subjectId?: string;
  gradeLevel?: GradeLevel;
  dayOfWeek?: DayOfWeek;
  sort?: 'day' | 'time' | 'class' | 'teacher' | 'subject' | 'updatedAt';
}

export interface TimetablePageResult {
  items: TimetableEntryResult[];
  total: number;
}

export type ScheduleConflictType =
  | 'TEACHER_CONFLICT'
  | 'TIME_SLOT_CONFLICT'
  | 'MISSING_ASSIGNMENT'
  | 'INVALID_PERIOD';

export interface ScheduleConflictResult {
  type: ScheduleConflictType;
  message: string;
  entryId?: string;
  conflictingEntryId?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface ValidateTimetableRequest {
  entry: CreateTimetableEntryRequest;
  excludeId?: string;
}

export interface CopyTimetableRequest {
  sourceClassId: string;
  targetClassId: string;
}

export interface PeriodResult {
  startTime: string;
  endTime: string;
  isBreak: boolean;
  order: number;
}

export interface TimetableDashboardResult {
  totalEntries: number;
  classesWithSchedules: number;
  todayEntries: number;
  classesScheduledToday: number;
  pendingConflicts: number;
  teacherWorkload: Array<{
    teacherId: string;
    teacherName: string;
    lessons: number;
  }>;
}

