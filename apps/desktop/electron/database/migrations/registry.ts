import type { Migration } from './types';
import { createPlatformTables } from './001-create-platform-tables';
import { createBusinessTables } from './002-create-business-tables';
import { createAcademicFoundationTables } from './003-create-academic-foundation-tables';

/**
 * Every migration, ascending by version. Append only — never edit or reorder
 * a shipped migration; MigrationService rejects drift at startup.
 */
export const migrations: readonly Migration[] = [
  createPlatformTables,
  createBusinessTables,
  createAcademicFoundationTables,
];
