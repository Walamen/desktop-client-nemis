import type { CreateDeviceInput, UpdateDeviceInput } from '../../dto/platform';
import type { QueryOptions } from '../../dto/query';
import type { Device } from '../../models/platform';

/**
 * This installation's device identity (single row today; the table stays
 * general). No delete — destroying the device row would orphan the sync
 * queue and metadata.
 */
export interface IDeviceRepository {
  findById(id: string): Device | null;
  findByIdOrThrow(id: string): Device;
  findAll(options?: QueryOptions): Device[];
  create(input: CreateDeviceInput): Device;
  update(id: string, input: UpdateDeviceInput): Device;
  exists(id: string): boolean;
  count(): number;
}
