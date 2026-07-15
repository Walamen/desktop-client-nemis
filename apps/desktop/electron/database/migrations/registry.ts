import type { Migration } from './types';
import { createPlatformTables } from './001-create-platform-tables';

/**
 * Every migration, ascending by version. Append only — never edit or reorder
 * a shipped migration; MigrationService rejects drift at startup.
 */
export const migrations: readonly Migration[] = [createPlatformTables];
