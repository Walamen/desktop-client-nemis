import { newId } from '../../../database/helpers/ids';
import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import type { CreateDeviceInput, UpdateDeviceInput } from '../../dto/platform';
import { deviceMapper, type DeviceRow } from '../../mappers/platformMappers';
import type { Device } from '../../models/platform';
import { validateCreateDevice, validateUpdateDevice } from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { IDeviceRepository } from '../interfaces/IDeviceRepository';

const DEVICE_COLUMNS = [
  'id',
  'deviceName',
  'platform',
  'osVersion',
  'appVersion',
  'createdAt',
  'updatedAt',
] as const;

export class SqliteDeviceRepository
  extends BaseRepository<DeviceRow, Device>
  implements IDeviceRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.devices,
      entityName: 'Device',
      columns: DEVICE_COLUMNS,
      mapper: deviceMapper,
    });
  }

  create(input: CreateDeviceInput): Device {
    this.validate(validateCreateDevice, input);
    const now = nowIso();
    return this.insertRow({
      id: newId(),
      deviceName: input.deviceName,
      platform: input.platform,
      osVersion: input.osVersion,
      appVersion: input.appVersion,
      createdAt: now,
      updatedAt: now,
    });
  }

  update(id: string, input: UpdateDeviceInput): Device {
    this.validate(validateUpdateDevice, input);
    return this.updateById(id, {
      deviceName: input.deviceName,
      osVersion: input.osVersion,
      appVersion: input.appVersion,
      updatedAt: nowIso(),
    });
  }
}
