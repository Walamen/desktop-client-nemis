import type { UpdateSyncMetadataInput } from '../../dto/platform';
import type { SyncMetadata } from '../../models/platform';

/**
 * The sync_metadata singleton. Seeded by the platform on startup — the
 * repository can read and patch it, never create or delete it. A missing
 * singleton is an integrity failure (EntityNotFoundError).
 */
export interface ISyncMetadataRepository {
  get(): SyncMetadata;
  update(input: UpdateSyncMetadataInput): SyncMetadata;
}
