import type { InfraApplicationService, RegisterDeviceDto } from '@nemis-desktop/application';
import { executeCommand, type CommandOutcome } from '../../core/async-runner';
import { toDeviceView } from '../../mappers/infra/infra-view-mapper';
import type { NotificationStore } from '../../stores/notification-store';
import type { DeviceView } from '../../view-models/device/device-views';

export class RegisterDeviceUiCommand {
  constructor(
    private readonly deps: {
      readonly infra: InfraApplicationService;
      readonly notifications: NotificationStore;
    },
  ) {}

  execute(dto: RegisterDeviceDto): Promise<CommandOutcome<DeviceView>> {
    return executeCommand({
      run: () => this.deps.infra.registerDevice(dto),
      map: toDeviceView,
      notifications: this.deps.notifications,
      successMessage: 'Device registered.',
    });
  }
}
