import type { TimetableApplicationService } from '@nemis-desktop/application';
import { DayOfWeek } from '@nemis-desktop/types';
import type {
  CopyTimetableRequest, CreateTimetableEntryRequest, PeriodResult,
  ScheduleConflictResult, TimetableDashboardResult, TimetableEntryResult,
  TimetableListRequest, UpdateTimetableEntryRequest,
} from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { executeCommand, trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { NotificationStore } from '../../stores/notification-store';

export interface TimetableState {
  entries: AsyncState<readonly TimetableEntryResult[]>;
  conflicts: AsyncState<readonly ScheduleConflictResult[]>;
  periods: AsyncState<readonly PeriodResult[]>;
  dashboard: AsyncState<TimetableDashboardResult>;
  filters: TimetableListRequest;
  total: number;
}

const JS_DAYS = [
  DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY,
] as const;

export class TimetableViewModel {
  readonly store = createStore<TimetableState>(() => ({
    entries: idleState(), conflicts: idleState(), periods: idleState(), dashboard: idleState(),
    filters: { limit: 100, offset: 0, sort: 'day' }, total: 0,
  }));
  constructor(private readonly deps: {
    timetables: TimetableApplicationService;
    notifications: NotificationStore;
  }) {}

  setFilters(filters: TimetableListRequest): void {
    this.store.setState({ filters: { limit: 100, offset: 0, sort: 'day', ...filters } });
  }
  async load(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().entries, set: entries => this.store.setState({ entries }) },
      fetch: () => this.deps.timetables.list(this.store.getState().filters),
      map: page => page.items,
      onData: page => this.store.setState({ total: page.total }),
      isEmpty: rows => rows.length === 0,
    });
  }
  async loadClass(classId:string):Promise<void>{this.setFilters({classId,limit:100,sort:'day'});await this.load();}
  async loadTeacher(teacherId:string):Promise<void>{this.setFilters({teacherId,limit:100,sort:'day'});await this.load();}
  async loadSubject(subjectId:string):Promise<void>{this.setFilters({subjectId,limit:100,sort:'day'});await this.load();}
  async loadConflicts():Promise<void>{
    await trackQuery({
      access:{get:()=>this.store.getState().conflicts,set:conflicts=>this.store.setState({conflicts})},
      fetch:()=>this.deps.timetables.detectConflicts(this.store.getState().filters),
      map:value=>value,isEmpty:value=>value.length===0,
    });
  }
  async loadPeriods(classId?:string):Promise<void>{
    await trackQuery({
      access:{get:()=>this.store.getState().periods,set:periods=>this.store.setState({periods})},
      fetch:()=>this.deps.timetables.periods(classId),map:value=>value,isEmpty:value=>value.length===0,
    });
  }
  async loadDashboard():Promise<void>{
    await trackQuery({
      access:{get:()=>this.store.getState().dashboard,set:dashboard=>this.store.setState({dashboard})},
      fetch:()=>this.deps.timetables.dashboard(JS_DAYS[new Date().getDay()]!),map:value=>value,
    });
  }
  async create(dto:CreateTimetableEntryRequest):Promise<CommandOutcome<TimetableEntryResult>>{
    return this.mutate(()=>this.deps.timetables.create(dto),'Timetable entry created.');
  }
  async update(dto:UpdateTimetableEntryRequest):Promise<CommandOutcome<TimetableEntryResult>>{
    return this.mutate(()=>this.deps.timetables.update(dto),'Timetable entry updated.');
  }
  async remove(id:string):Promise<CommandOutcome<{id:string}>>{
    const outcome=await executeCommand({run:()=>this.deps.timetables.delete(id),map:v=>v,notifications:this.deps.notifications,successMessage:'Timetable entry removed.'});
    if(outcome.ok)await this.refresh();
    return outcome;
  }
  async copy(dto:CopyTimetableRequest):Promise<CommandOutcome<TimetableEntryResult[]>>{
    const outcome=await executeCommand({run:()=>this.deps.timetables.copy(dto),map:v=>v,notifications:this.deps.notifications,successMessage:'Timetable copied.'});
    if(outcome.ok)await this.refresh();
    return outcome;
  }
  private async mutate(run:()=>ReturnType<TimetableApplicationService['create']>,message:string){
    const outcome=await executeCommand({run,map:v=>v,notifications:this.deps.notifications,successMessage:message});
    if(outcome.ok)await this.refresh();
    return outcome;
  }
  private async refresh():Promise<void>{await Promise.all([this.load(),this.loadConflicts(),this.loadPeriods(),this.loadDashboard()]);}
}

export class TeacherScheduleViewModel { constructor(readonly core:TimetableViewModel){} load=(id:string)=>this.core.loadTeacher(id); }
export class ClassScheduleViewModel { constructor(readonly core:TimetableViewModel){} load=(id:string)=>this.core.loadClass(id); }
export class SubjectScheduleViewModel { constructor(readonly core:TimetableViewModel){} load=(id:string)=>this.core.loadSubject(id); }
export class ConflictViewModel { constructor(readonly core:TimetableViewModel){} load=()=>this.core.loadConflicts(); }
export class TimetableDashboardViewModel { constructor(readonly core:TimetableViewModel){} load=()=>this.core.loadDashboard(); }

