import type { AttendanceApplicationService, RecordAttendanceDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toAttendanceRowView } from '../../mappers/attendance/attendance-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { AttendanceRowView } from '../../view-models/attendance/attendance-views';

export interface AttendanceCommandDeps {
  readonly attendance: AttendanceApplicationService;
  readonly notifications: NotificationStore;
}

export class RecordAttendanceUiCommand {
  constructor(private readonly deps: AttendanceCommandDeps) {}

  execute(dto: RecordAttendanceDto): Promise<CommandOutcome<AttendanceRowView>> {
    return executeCommand({
      run: () => this.deps.attendance.record(dto),
      map: toAttendanceRowView,
      notifications: this.deps.notifications,
      successMessage: 'Attendance recorded.',
    });
  }
}
