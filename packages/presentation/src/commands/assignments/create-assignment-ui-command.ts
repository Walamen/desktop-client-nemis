import type { CreateAssignmentDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toAssignmentDetailView } from '../../mappers/assignments/assignment-view-mapper';
import type { AssignmentDetailView } from '../../view-models/assignments/assignment-views';
import type { AssignmentCommandDeps } from './assignment-command-deps';

export class CreateAssignmentUiCommand {
  constructor(private readonly deps: AssignmentCommandDeps) {}

  execute(dto: CreateAssignmentDto): Promise<CommandOutcome<AssignmentDetailView>> {
    return executeCommand({
      run: () => this.deps.assignments.create(dto),
      map: toAssignmentDetailView,
      notifications: this.deps.notifications,
      successMessage:
        dto.status === 'ACTIVE' ? 'Assignment sent to class.' : 'Assignment saved as draft.',
    });
  }
}
