/** Mints ids for new aggregates. Offline-first clients generate the entity id
 * locally so the record can be created and queued for sync without a round-trip. */
export interface IIdGenerator {
  next(): string;
}
