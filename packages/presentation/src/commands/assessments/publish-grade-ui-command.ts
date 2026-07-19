import type { PublishGradeDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toGradeRowView } from '../../mappers/assessments/assessment-view-mapper';
import type { GradeRowView } from '../../view-models/assessments/assessments-views';
import type { AssessmentsCommandDeps } from './create-assessment-ui-command';

export class PublishGradeUiCommand {
  constructor(private readonly deps: AssessmentsCommandDeps) {}

  execute(dto: PublishGradeDto): Promise<CommandOutcome<GradeRowView>> {
    return executeCommand({
      run: () => this.deps.assessments.publishGrade(dto),
      map: toGradeRowView,
      notifications: this.deps.notifications,
      successMessage: 'Grade published.',
    });
  }
}
