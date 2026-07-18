import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { UpdateSettingsDto, SettingOutput } from '../../dto/infra/infra-dto';
import type { ISettingsGateway } from '../../interfaces/infra/settings-gateway';
import type { IClock } from '../../interfaces/clock';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { SettingsUpdated } from '../../events/infra';

export interface UpdateSettingsDeps {
  settingsGateway: ISettingsGateway;
  clock: IClock;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class UpdateSettingsUseCase implements CommandHandler<
  UpdateSettingsDto,
  ApplicationResponse<SettingOutput>
> {
  constructor(private readonly deps: UpdateSettingsDeps) {}

  execute(command: UpdateSettingsDto): Promise<ApplicationResponse<SettingOutput>> {
    return invokeUseCase('UpdateSettings', this.deps.logger, async () => {
      requireFields(command, ['key']);
      const setting = this.deps.settingsGateway.set(command.key, command.value);

      const event: SettingsUpdated = {
        name: 'SettingsUpdated',
        occurredAt: this.deps.clock.now(),
        key: command.key,
      };
      this.deps.events.publish(event);

      return ok(setting);
    });
  }
}
