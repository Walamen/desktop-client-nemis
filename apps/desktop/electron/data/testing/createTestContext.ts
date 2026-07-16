import type { DatabaseLogger } from '../../database/DatabaseManager';
import { migrations } from '../../database/migrations/registry';
import { MigrationService } from '../../database/services/MigrationService';
import { createTestDatabase } from '../../database/testing/createTestDatabase';
import { TransactionManager } from '../../database/transaction/TransactionManager';
import type { RepositoryContext } from '../repositories/base/RepositoryContext';

export interface TestContext {
  context: RepositoryContext;
  cleanup(): void;
}

const silentLog: DatabaseLogger = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * Real temp-file SQLite with every migration applied — repositories are
 * tested against the production schema. Metadata is NOT seeded; tests seed
 * exactly what they need.
 */
export function createTestContext(): TestContext {
  const test = createTestDatabase();
  new MigrationService(test.db.raw, migrations).migrateToLatest();
  return {
    context: {
      connection: test.db.raw,
      transactions: new TransactionManager(test.db.raw),
      log: silentLog,
    },
    cleanup: () => test.cleanup(),
  };
}
