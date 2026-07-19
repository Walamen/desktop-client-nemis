import type { LinkGuardianDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toStudentDetailsView } from '../../mappers/students/student-view-mapper';
import type { StudentDetailsView } from '../../view-models/students/students-views';
import type { StudentsCommandDeps } from './students-command-deps';

export class LinkGuardianUiCommand {
  constructor(private readonly deps: StudentsCommandDeps) {}

  execute(dto: LinkGuardianDto): Promise<CommandOutcome<StudentDetailsView>> {
    return executeCommand({
      run: () => this.deps.students.linkGuardian(dto),
      map: toStudentDetailsView,
      notifications: this.deps.notifications,
      successMessage: 'Guardian linked.',
    });
  }
}
