import { nowIso } from '../../../database/helpers/time';
import { TableNames } from '../../../database/schema/tableNames';
import type { UpdateSyncMetadataInput } from '../../dto/platform';
import { syncMetadataMapper, type SyncMetadataRow } from '../../mappers/platformMappers';
import type { SyncMetadata } from '../../models/platform';
import { validateUpdateSyncMetadata } from '../../validators/platform';
import { BaseRepository } from '../base/BaseRepository';
import type { RepositoryContext } from '../base/RepositoryContext';
import type { ISyncMetadataRepository } from '../interfaces/ISyncMetadataRepository';

const SYNC_METADATA_COLUMNS = [
  'id',
  'lastSyncAt',
  'schemaVersion',
  'databaseVersion',
  'syncStatus',
  'createdAt',
  'updatedAt',
] as const;

const SINGLETON_ID = 'singleton';

export class SqliteSyncMetadataRepository
  extends BaseRepository<SyncMetadataRow, SyncMetadata>
  implements ISyncMetadataRepository
{
  constructor(context: RepositoryContext) {
    super(context, {
      table: TableNames.syncMetadata,
      entityName: 'SyncMetadata',
      columns: SYNC_METADATA_COLUMNS,
      mapper: syncMetadataMapper,
    });
  }

  get(): SyncMetadata {
    return this.findByIdOrThrow(SINGLETON_ID);
  }

  update(input: UpdateSyncMetadataInput): SyncMetadata {
    this.validate(validateUpdateSyncMetadata, input);
    return this.updateById(SINGLETON_ID, {
      lastSyncAt: input.lastSyncAt,
      syncStatus: input.syncStatus,
      schemaVersion: input.schemaVersion,
      databaseVersion: input.databaseVersion,
      updatedAt: nowIso(),
    });
  }
}
