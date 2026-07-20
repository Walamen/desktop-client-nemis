import type { DeviceOutput, RegisterDeviceDto } from '../../dto/infra/infra-dto';

/** Infra gateway for device identity. Speaks in application DTOs because there
 * is no Device domain entity. The Electron adapter maps to the SQLite DAL. */
export interface IDeviceGateway {
  register(input: RegisterDeviceDto): DeviceOutput;
  /** This installation's device identity, or null if not registered. */
  getCurrent(): DeviceOutput | null;
}
