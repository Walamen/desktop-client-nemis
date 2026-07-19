import type {
  AssessmentsApplicationService,
  CreateAssessmentDto,
} from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toAssessmentView } from '../../mappers/assessments/assessment-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { AssessmentView } from '../../view-models/assessments/assessments-views';

export interface AssessmentsCommandDeps {
  readonly assessments: AssessmentsApplicationService;
  readonly notifications: NotificationStore;
}

export class CreateAssessmentUiCommand {
  constructor(private readonly deps: AssessmentsCommandDeps) {}

  execute(dto: CreateAssessmentDto): Promise<CommandOutcome<AssessmentView>> {
    return executeCommand({
      run: () => this.deps.assessments.createAssessment(dto),
      map: toAssessmentView,
      notifications: this.deps.notifications,
      successMessage: 'Assessment created.',
    });
  }
}
