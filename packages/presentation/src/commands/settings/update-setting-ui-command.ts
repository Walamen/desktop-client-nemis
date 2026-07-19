import type { InfraApplicationService, UpdateSettingsDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toSettingView } from '../../mappers/infra/infra-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { SettingView } from '../../view-models/device/device-views';

export class UpdateSettingUiCommand {
  constructor(
    private readonly deps: {
      readonly infra: InfraApplicationService;
      readonly notifications: NotificationStore;
    },
  ) {}

  execute(dto: UpdateSettingsDto): Promise<CommandOutcome<SettingView>> {
    return executeCommand({
      run: () => this.deps.infra.updateSettings(dto),
      map: toSettingView,
      notifications: this.deps.notifications,
      successMessage: 'Setting saved.',
    });
  }
}
