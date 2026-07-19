import type { AcademicsApplicationService, EnrollStudentDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toEnrollmentRowView } from '../../mappers/academics/enrollment-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { EnrollmentRowView } from '../../view-models/class-roster/class-roster-views';

export interface AcademicsCommandDeps {
  readonly academics: AcademicsApplicationService;
  readonly notifications: NotificationStore;
}

export class EnrollStudentUiCommand {
  constructor(private readonly deps: AcademicsCommandDeps) {}

  execute(dto: EnrollStudentDto): Promise<CommandOutcome<EnrollmentRowView>> {
    return executeCommand({
      run: () => this.deps.academics.enroll(dto),
      map: toEnrollmentRowView,
      notifications: this.deps.notifications,
      successMessage: 'Student enrolled.',
    });
  }
}
