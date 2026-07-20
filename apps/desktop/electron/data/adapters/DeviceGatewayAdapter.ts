import type { DeviceOutput, IDeviceGateway, RegisterDeviceDto } from '@nemis-desktop/application';
import type { IDeviceRepository } from '../repositories/interfaces/IDeviceRepository';

/** Adapts the SQLite device repository to the application's IDeviceGateway. */
export class DeviceGatewayAdapter implements IDeviceGateway {
  constructor(private readonly devices: IDeviceRepository) {}
  register(input: RegisterDeviceDto): DeviceOutput {
    const device = this.devices.create({
      deviceName: input.deviceName,
      platform: input.platform,
      osVersion: input.osVersion,
      appVersion: input.appVersion,
    });
    return {
      id: device.id,
      deviceName: device.deviceName,
      platform: device.platform,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }
  getCurrent(): DeviceOutput | null {
    // One device row per install; if re-registration ever adds more, "current"
    // is the most recently created — matching the in-memory gateway's
    // most-recent-registration semantics.
    const [device] = this.devices.findAll({
      orderBy: [{ column: 'createdAt', direction: 'desc' }],
      page: { limit: 1, offset: 0 },
    });
    if (!device) return null;
    return {
      id: device.id,
      deviceName: device.deviceName,
      platform: device.platform,
      osVersion: device.osVersion,
      appVersion: device.appVersion,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }
}
