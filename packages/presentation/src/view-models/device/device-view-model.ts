import type { InfraApplicationService, RegisterDeviceDto } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import type { CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { RegisterDeviceUiCommand } from '../../commands/device/register-device-ui-command';
import type { NotificationStore } from '../../stores/notification-store';
import type { SessionStore } from '../../stores/session-store';
import type { DeviceView } from './device-views';

export interface DeviceState {
  readonly device: AsyncState<DeviceView>;
  readonly submission: SubmissionStatus;
}

export interface DeviceViewModelDeps {
  readonly infra: InfraApplicationService;
  readonly notifications: NotificationStore;
  readonly session: SessionStore;
}

export class DeviceViewModel {
  readonly store = createStore<DeviceState>(() => ({
    device: idleState(),
    submission: 'idle',
  }));

  private readonly registerCommand: RegisterDeviceUiCommand;

  constructor(private readonly deps: DeviceViewModelDeps) {
    this.registerCommand = new RegisterDeviceUiCommand({
      infra: deps.infra,
      notifications: deps.notifications,
    });
  }

  async registerDevice(dto: RegisterDeviceDto): Promise<CommandOutcome<DeviceView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.registerCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.store.setState({ device: { status: 'success', data: outcome.data } });
      this.deps.session.setCurrentDevice(outcome.data.id);
    }
    return outcome;
  }
}
