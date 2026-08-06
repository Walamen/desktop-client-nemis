import type { DeleteAssignmentDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import type { AssignmentCommandDeps } from './assignment-command-deps';

export class DeleteAssignmentUiCommand {
  constructor(private readonly deps: AssignmentCommandDeps) {}

  execute(dto: DeleteAssignmentDto): Promise<CommandOutcome<{ id: string }>> {
    return executeCommand({
      run: () => this.deps.assignments.remove(dto),
      map: (v) => v,
      notifications: this.deps.notifications,
      successMessage: 'Assignment deleted.',
    });
  }
}
