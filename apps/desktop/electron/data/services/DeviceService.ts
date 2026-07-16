import type { Device } from '../models/platform';
import type { IDeviceRepository } from '../repositories/interfaces/IDeviceRepository';

export interface DeviceServiceDeps {
  devices: IDeviceRepository;
}

/** Async facade over the device repository — the surface IPC and sync call. */
export class DeviceService {
  readonly #deps: DeviceServiceDeps;

  constructor(deps: DeviceServiceDeps) {
    this.#deps = deps;
  }

  list(): Promise<Device[]> {
    return Promise.resolve(this.#deps.devices.findAll());
  }

  get(id: string): Promise<Device | null> {
    return Promise.resolve(this.#deps.devices.findById(id));
  }
}
