import type {
  InstitutionApplicationService,
  UpdateGradingConfigDto,
} from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toGradingConfigView } from '../../mappers/institution/institution-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { GradingConfigView } from '../../view-models/settings/settings-views';

export class UpdateGradingConfigUiCommand {
  constructor(
    private readonly deps: {
      readonly institution: InstitutionApplicationService;
      readonly notifications: NotificationStore;
    },
  ) {}

  execute(dto: UpdateGradingConfigDto): Promise<CommandOutcome<GradingConfigView>> {
    return executeCommand({
      run: () => this.deps.institution.updateGradingConfig(dto),
      map: toGradingConfigView,
      notifications: this.deps.notifications,
      successMessage: 'Grading configuration saved.',
    });
  }
}
