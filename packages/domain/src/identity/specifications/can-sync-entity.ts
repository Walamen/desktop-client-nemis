import { Specification } from '../../core';

export interface SyncableSnapshot {
  version: number;
  updatedAt: string;
}

/** An entity may sync only when it carries valid concurrency metadata. */
export class CanSyncEntity extends Specification<SyncableSnapshot> {
  isSatisfiedBy(candidate: SyncableSnapshot): boolean {
    return candidate.version >= 1 && !Number.isNaN(Date.parse(candidate.updatedAt));
  }
}
