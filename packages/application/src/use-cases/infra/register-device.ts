import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { RegisterDeviceDto, DeviceOutput } from '../../dto/infra/infra-dto';
import type { IDeviceGateway } from '../../interfaces/infra/device-gateway';
import type { IClock } from '../../interfaces/clock';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { DeviceRegistered } from '../../events/infra';

export interface RegisterDeviceDeps {
  deviceGateway: IDeviceGateway;
  clock: IClock;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class RegisterDeviceUseCase implements CommandHandler<
  RegisterDeviceDto,
  ApplicationResponse<DeviceOutput>
> {
  constructor(private readonly deps: RegisterDeviceDeps) {}

  execute(command: RegisterDeviceDto): Promise<ApplicationResponse<DeviceOutput>> {
    return invokeUseCase('RegisterDevice', this.deps.logger, async () => {
      requireFields(command, ['deviceName', 'platform', 'osVersion', 'appVersion']);
      const device = this.deps.deviceGateway.register(command);

      const event: DeviceRegistered = {
        name: 'DeviceRegistered',
        occurredAt: this.deps.clock.now(),
        deviceId: device.id,
      };
      this.deps.events.publish(event);

      return ok(device);
    });
  }
}
