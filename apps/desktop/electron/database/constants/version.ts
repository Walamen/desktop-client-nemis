/**
 * Platform data-format version (recorded in sync_metadata.databaseVersion).
 * Distinct from the migration schema version: bump only when the on-disk
 * platform contract changes incompatibly (e.g. encryption introduced).
 */
export const DATABASE_VERSION = 1;
