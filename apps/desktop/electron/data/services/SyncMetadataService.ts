import type { UpdateSyncMetadataInput } from '../dto/platform';
import type { SyncMetadata } from '../models/platform';
import type { ISyncMetadataRepository } from '../repositories/interfaces/ISyncMetadataRepository';

export interface SyncMetadataServiceDeps {
  syncMetadata: ISyncMetadataRepository;
}

export class SyncMetadataService {
  readonly #deps: SyncMetadataServiceDeps;

  constructor(deps: SyncMetadataServiceDeps) {
    this.#deps = deps;
  }

  get(): Promise<SyncMetadata> {
    return Promise.resolve(this.#deps.syncMetadata.get());
  }

  update(input: UpdateSyncMetadataInput): Promise<SyncMetadata> {
    return Promise.resolve(this.#deps.syncMetadata.update(input));
  }
}
