import type { AttendanceApplicationService, RecordAttendanceDto } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { RecordAttendanceUiCommand } from '../../commands/attendance/record-attendance-ui-command';
import { toAttendanceRowView } from '../../mappers/attendance/attendance-view-mapper';
import { GetAttendanceUiQuery } from '../../queries/attendance/get-attendance-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { AttendanceRowView } from './attendance-views';

export interface AttendanceState {
  readonly classId: string | null;
  readonly date: string | null;
  readonly records: AsyncState<readonly AttendanceRowView[]>;
  readonly submission: SubmissionStatus;
}

export interface AttendanceViewModelDeps {
  readonly attendance: AttendanceApplicationService;
  readonly notifications: NotificationStore;
}

export class AttendanceViewModel {
  readonly store = createStore<AttendanceState>(() => ({
    classId: null,
    date: null,
    records: idleState(),
    submission: 'idle',
  }));

  private readonly attendanceQuery: GetAttendanceUiQuery;
  private readonly recordCommand: RecordAttendanceUiCommand;

  constructor(deps: AttendanceViewModelDeps) {
    this.attendanceQuery = new GetAttendanceUiQuery(deps.attendance);
    this.recordCommand = new RecordAttendanceUiCommand({
      attendance: deps.attendance,
      notifications: deps.notifications,
    });
  }

  async loadAttendance(classId: string, date: string): Promise<void> {
    this.store.setState({ classId, date });
    await trackQuery({
      access: {
        get: () => this.store.getState().records,
        set: (records) => this.store.setState({ records }),
      },
      fetch: () => this.attendanceQuery.execute({ classId, date }),
      map: (rows) => rows.map(toAttendanceRowView),
      isEmpty: (rows) => rows.length === 0,
    });
  }

  async recordAttendance(dto: RecordAttendanceDto): Promise<CommandOutcome<AttendanceRowView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.recordCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) await this.loadAttendance(dto.classId, dto.date);
    return outcome;
  }
}
