import type { WithdrawEnrollmentDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toEnrollmentRowView } from '../../mappers/academics/enrollment-view-mapper';
import type { EnrollmentRowView } from '../../view-models/class-roster/class-roster-views';
import type { AcademicsCommandDeps } from './enroll-student-ui-command';

export class WithdrawEnrollmentUiCommand {
  constructor(private readonly deps: AcademicsCommandDeps) {}

  execute(dto: WithdrawEnrollmentDto): Promise<CommandOutcome<EnrollmentRowView>> {
    return executeCommand({
      run: () => this.deps.academics.withdraw(dto),
      map: toEnrollmentRowView,
      notifications: this.deps.notifications,
      successMessage: 'Enrollment withdrawn.',
    });
  }
}
