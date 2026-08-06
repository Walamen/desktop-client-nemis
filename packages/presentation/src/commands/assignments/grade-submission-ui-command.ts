import type { GradeSubmissionDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toAssignmentSubmissionRowView } from '../../mappers/assignments/assignment-view-mapper';
import type { AssignmentSubmissionRowView } from '../../view-models/assignments/assignment-views';
import type { AssignmentCommandDeps } from './assignment-command-deps';

export class GradeSubmissionUiCommand {
  constructor(private readonly deps: AssignmentCommandDeps) {}

  execute(dto: GradeSubmissionDto): Promise<CommandOutcome<AssignmentSubmissionRowView>> {
    return executeCommand({
      run: () => this.deps.assignments.gradeSubmission(dto),
      map: toAssignmentSubmissionRowView,
      notifications: this.deps.notifications,
      successMessage: 'Grade saved.',
    });
  }
}
