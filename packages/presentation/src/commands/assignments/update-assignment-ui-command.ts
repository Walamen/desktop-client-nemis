import type { UpdateAssignmentDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toAssignmentDetailView } from '../../mappers/assignments/assignment-view-mapper';
import type { AssignmentDetailView } from '../../view-models/assignments/assignment-views';
import type { AssignmentCommandDeps } from './assignment-command-deps';

export class UpdateAssignmentUiCommand {
  constructor(private readonly deps: AssignmentCommandDeps) {}

  execute(dto: UpdateAssignmentDto): Promise<CommandOutcome<AssignmentDetailView>> {
    return executeCommand({
      run: () => this.deps.assignments.update(dto),
      map: toAssignmentDetailView,
      notifications: this.deps.notifications,
      successMessage: 'Assignment updated.',
    });
  }
}
