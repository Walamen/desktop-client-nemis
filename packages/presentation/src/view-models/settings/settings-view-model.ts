import type {
  InfraApplicationService,
  InstitutionApplicationService,
  UpdateGradingConfigDto,
  UpdateSettingsDto,
} from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery, type CommandOutcome } from '../../core/async-runner';
import type { SubmissionStatus } from '../../core/submission';
import { UpdateGradingConfigUiCommand } from '../../commands/settings/update-grading-config-ui-command';
import { UpdateSettingUiCommand } from '../../commands/settings/update-setting-ui-command';
import { toInstitutionProfileView } from '../../mappers/institution/institution-view-mapper';
import { GetInstitutionProfileUiQuery } from '../../queries/settings/get-institution-profile-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { SettingView } from '../device/device-views';
import type { GradingConfigView, InstitutionProfileView } from './settings-views';

export interface SettingsState {
  readonly profile: AsyncState<InstitutionProfileView>;
  readonly gradingConfig: AsyncState<GradingConfigView>;
  readonly submission: SubmissionStatus;
}

export interface SettingsViewModelDeps {
  readonly institution: InstitutionApplicationService;
  readonly infra: InfraApplicationService;
  readonly notifications: NotificationStore;
}

export class SettingsViewModel {
  readonly store = createStore<SettingsState>(() => ({
    profile: idleState(),
    gradingConfig: idleState(),
    submission: 'idle',
  }));

  private readonly profileQuery: GetInstitutionProfileUiQuery;
  private readonly gradingConfigCommand: UpdateGradingConfigUiCommand;
  private readonly settingCommand: UpdateSettingUiCommand;

  constructor(deps: SettingsViewModelDeps) {
    this.profileQuery = new GetInstitutionProfileUiQuery(deps.institution);
    this.gradingConfigCommand = new UpdateGradingConfigUiCommand({
      institution: deps.institution,
      notifications: deps.notifications,
    });
    this.settingCommand = new UpdateSettingUiCommand({
      infra: deps.infra,
      notifications: deps.notifications,
    });
  }

  async loadProfile(institutionId: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().profile,
        set: (profile) => this.store.setState({ profile }),
      },
      fetch: () => this.profileQuery.execute(institutionId),
      map: toInstitutionProfileView,
    });
  }

  async saveGradingConfig(dto: UpdateGradingConfigDto): Promise<CommandOutcome<GradingConfigView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.gradingConfigCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    if (outcome.ok) {
      this.store.setState({ gradingConfig: { status: 'success', data: outcome.data } });
    }
    return outcome;
  }

  async saveSetting(dto: UpdateSettingsDto): Promise<CommandOutcome<SettingView>> {
    this.store.setState({ submission: 'submitting' });
    const outcome = await this.settingCommand.execute(dto);
    this.store.setState({ submission: outcome.ok ? 'submitted' : 'failed' });
    return outcome;
  }
}
