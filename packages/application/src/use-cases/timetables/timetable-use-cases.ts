import { TimetableEntry } from '@nemis-desktop/domain';
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
import { WorkflowException } from '../../exceptions';
import type { IAppLogger } from '../../interfaces/app-logger';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { ITimetableRepository } from '../../interfaces/timetables';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { ok, type ApplicationResponse } from '../../core/response';

interface ReadDeps { timetables: ITimetableRepository; logger: IAppLogger }
interface WriteDeps extends ReadDeps { clock: IClock; ids: IIdGenerator }

function assertAssignment(
  repository: ITimetableRepository,
  entry: TimetableEntry,
): ScheduleConflictResult[] {
  const value = entry.data;
  if (value.isBreak || !value.subjectId || !value.staffId) return [];
  return repository.hasAssignment(value.classId, value.subjectId, value.staffId)
    ? []
    : [{
        type: 'MISSING_ASSIGNMENT',
        message: 'Assign this teacher to the selected class and subject before scheduling.',
        dayOfWeek: value.dayOfWeek,
        startTime: value.startTime,
        endTime: value.endTime,
      }];
}

function conflicts(repository: ITimetableRepository, entry: TimetableEntry, excludeId?: string) {
  return [...assertAssignment(repository, entry), ...repository.detectConflicts(entry, excludeId)];
}

function createEntity(
  dto: CreateTimetableEntryRequest,
  id: string,
  now: string,
): TimetableEntry {
  return TimetableEntry.create({
    ...dto,
    id,
    isBreak: dto.isBreak ?? false,
    createdAt: now,
    updatedAt: now,
  });
}

export class CreateTimetable {
  constructor(private readonly deps: WriteDeps) {}
  execute(dto: CreateTimetableEntryRequest): Promise<ApplicationResponse<TimetableEntryResult>> {
    return invokeUseCase('CreateTimetable', this.deps.logger, async () => {
      const entry = createEntity(dto, this.deps.ids.next(), this.deps.clock.now());
      const found = conflicts(this.deps.timetables, entry);
      if (found.length) throw new WorkflowException(found.map((item) => item.message).join(' '));
      return ok(this.deps.timetables.save(entry));
    });
  }
}

export class UpdateTimetable {
  constructor(private readonly deps: WriteDeps) {}
  execute(dto: UpdateTimetableEntryRequest): Promise<ApplicationResponse<TimetableEntryResult>> {
    return invokeUseCase('UpdateTimetable', this.deps.logger, async () => {
      const entry = this.deps.timetables.findById(dto.id);
      if (!entry) throw new WorkflowException('Timetable entry not found.');
      const { id: _id, ...changes } = dto;
      entry.update({ ...changes, isBreak: changes.isBreak ?? entry.data.isBreak }, this.deps.clock.now());
      const found = conflicts(this.deps.timetables, entry, entry.id);
      if (found.length) throw new WorkflowException(found.map((item) => item.message).join(' '));
      return ok(this.deps.timetables.save(entry));
    });
  }
}

export class DeleteTimetable {
  constructor(private readonly deps: ReadDeps) {}
  execute(id: string): Promise<ApplicationResponse<{ id: string }>> {
    return invokeUseCase('DeleteTimetable', this.deps.logger, async () => {
      if (!this.deps.timetables.findById(id)) throw new WorkflowException('Timetable entry not found.');
      this.deps.timetables.remove(id);
      return ok({ id });
    });
  }
}

export class CopyTimetable {
  constructor(private readonly deps: WriteDeps) {}
  execute(dto: CopyTimetableRequest): Promise<ApplicationResponse<TimetableEntryResult[]>> {
    return invokeUseCase('CopyTimetable', this.deps.logger, async () => {
      if (dto.sourceClassId === dto.targetClassId) {
        throw new WorkflowException('Choose a different destination class.');
      }
      const source = this.deps.timetables.findPage({
        classId: dto.sourceClassId, limit: 10_000, offset: 0, sort: 'day',
      }).items;
      if (!source.length) throw new WorkflowException('The source class has no timetable to copy.');
      const ids = source.map(() => this.deps.ids.next());
      return ok(this.deps.timetables.copy(dto, ids, this.deps.clock.now()));
    });
  }
}

export class SearchTimetables {
  constructor(private readonly deps: ReadDeps) {}
  execute(dto: TimetableListRequest): Promise<ApplicationResponse<TimetablePageResult>> {
    return invokeUseCase('SearchTimetables', this.deps.logger, async () =>
      ok(this.deps.timetables.findPage({ ...dto, limit: dto.limit ?? 100, offset: dto.offset ?? 0 })),
    );
  }
}

export class GenerateWeeklySchedule extends SearchTimetables {}
export class GetTeacherSchedule extends SearchTimetables {}
export class GetClassSchedule extends SearchTimetables {}
export class GetSubjectSchedule extends SearchTimetables {}

export class ValidateTimetable {
  constructor(private readonly deps: WriteDeps) {}
  execute(dto: ValidateTimetableRequest): Promise<ApplicationResponse<ScheduleConflictResult[]>> {
    return invokeUseCase('ValidateTimetable', this.deps.logger, async () => {
      const now = this.deps.clock.now();
      const entry = createEntity(dto.entry, dto.excludeId ?? this.deps.ids.next(), now);
      return ok(conflicts(this.deps.timetables, entry, dto.excludeId));
    });
  }
}

export class DetectScheduleConflicts {
  constructor(private readonly deps: ReadDeps) {}
  execute(filter: TimetableListRequest = {}): Promise<ApplicationResponse<ScheduleConflictResult[]>> {
    return invokeUseCase('DetectScheduleConflicts', this.deps.logger, async () => {
      const entries = this.deps.timetables.findPage({ ...filter, limit: 10_000, offset: 0 }).items;
      const unique = new Map<string, ScheduleConflictResult>();
      for (const row of entries) {
        const entity = TimetableEntry.reconstitute({
          id: row.id, institutionId: row.institutionId, classId: row.classId,
          subjectId: row.subjectId, staffId: row.staffId, assignmentId: row.assignmentId,
          dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime,
          room: row.room, isBreak: row.isBreak, createdAt: row.createdAt, updatedAt: row.updatedAt,
        });
        for (const conflict of conflicts(this.deps.timetables, entity, row.id)) {
          const key = [conflict.type, row.id, conflict.conflictingEntryId].sort().join(':');
          unique.set(key, { ...conflict, entryId: row.id });
        }
      }
      return ok([...unique.values()]);
    });
  }
}

export class GetTimetablePeriods {
  constructor(private readonly deps: ReadDeps) {}
  execute(classId?: string): Promise<ApplicationResponse<PeriodResult[]>> {
    return invokeUseCase('GetTimetablePeriods', this.deps.logger, async () =>
      ok(this.deps.timetables.periods(classId)),
    );
  }
}

export class GetTimetableDashboard {
  constructor(private readonly deps: ReadDeps & { clock: IClock }) {}
  execute(dayOfWeek: string): Promise<ApplicationResponse<TimetableDashboardResult>> {
    return invokeUseCase('GetTimetableDashboard', this.deps.logger, async () =>
      ok(this.deps.timetables.dashboard(dayOfWeek)),
    );
  }
}
