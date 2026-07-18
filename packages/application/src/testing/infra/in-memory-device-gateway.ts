import type { IDeviceGateway } from '../../interfaces/infra/device-gateway';
import type { DeviceOutput, RegisterDeviceDto } from '../../dto/infra/infra-dto';

export class InMemoryDeviceGateway implements IDeviceGateway {
  readonly registered: DeviceOutput[] = [];
  private n = 0;
  register(input: RegisterDeviceDto): DeviceOutput {
    this.n += 1;
    const now = '2026-07-18T00:00:00.000Z';
    const device: DeviceOutput = { id: `dev-${this.n}`, ...input, createdAt: now, updatedAt: now };
    this.registered.push(device);
    return device;
  }
}
