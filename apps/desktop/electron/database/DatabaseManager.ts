import type { Database as SqliteDatabase } from 'better-sqlite3';
import { Database } from './Database';
import { resolveDatabasePaths, type DatabasePaths } from './constants/paths';
import { ConnectionError } from './errors/errors';
import { wrapSqliteError } from './errors/wrapSqliteError';
import { newId } from './helpers/ids';
import { nowIso } from './helpers/time';
import { migrations } from './migrations/registry';
import { TableNames } from './schema/tableNames';
import { initializeMetadata, type DeviceInfo } from './seed/initializeMetadata';
import { MigrationService } from './services/MigrationService';
import { TransactionManager } from './transaction/TransactionManager';

export interface DatabaseLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export type DatabaseState = 'idle' | 'ready' | 'closed' | 'failed';

export interface DatabaseManagerOptions {
  userDataDir: string;
  device: DeviceInfo;
  log?: DatabaseLogger;
  /** 64-char hex; provided by main via safeStorage-backed key store. */
  encryptionKey?: string;
}

const silentLogger: DatabaseLogger = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * The single lifecycle owner and the only database entry point main.ts uses:
 *
 *   initialize(): open → validate + pragmas → migrate → seed metadata → ready
 *   shutdown():   audit stop → checkpoint WAL → optimize → close → closed
 *
 * Both are idempotent. A failed initialize() closes any partially opened
 * connection before rethrowing — a connection can never leak.
 */
export class DatabaseManager {
  readonly #options: DatabaseManagerOptions;
  readonly #paths: DatabasePaths;
  readonly #log: DatabaseLogger;
  #db: Database | null = null;
  #transactions: TransactionManager | null = null;
  #deviceId: string | null = null;
  #state: DatabaseState = 'idle';

  constructor(options: DatabaseManagerOptions) {
    this.#options = options;
    this.#paths = resolveDatabasePaths(options.userDataDir);
    this.#log = options.log ?? silentLogger;
  }

  initialize(): void {
    if (this.#state === 'ready') {
      return;
    }
    try {
      this.#log.info(`Opening database: ${this.#paths.databaseFile}`);
      this.#db = Database.open({
        filePath: this.#paths.databaseFile,
        encryptionKey: this.#options.encryptionKey,
      });

      const migrationService = new MigrationService(this.#db.raw, migrations);
      const applied = migrationService.migrateToLatest();
      for (const migration of applied) {
        this.#log.info(
          `Applied migration v${migration.version} (${migration.name}) in ${migration.durationMs}ms`,
        );
      }

      const seeded = initializeMetadata(
        this.#db.raw,
        this.#options.device,
        migrationService.currentVersion(),
      );
      this.#deviceId = seeded.deviceId;
      this.#transactions = new TransactionManager(this.#db.raw);

      if (this.#db.wasEncryptedInPlace) {
        this.#writeAudit('database.encrypted', { cipher: 'sqlcipher' });
        this.#log.info('Existing plaintext database encrypted in place');
      }

      this.#writeAudit('database.started', {
        schemaVersion: migrationService.currentVersion(),
        migrationsApplied: applied.length,
        deviceCreated: seeded.deviceCreated,
      });
      this.#state = 'ready';
      this.#log.info('Database ready');
    } catch (error) {
      this.#state = 'failed';
      this.#log.error('Database initialization failed', error);
      try {
        this.#db?.close();
      } catch (closeError) {
        this.#log.warn(`Cleanup close failed after init failure: ${String(closeError)}`);
      }
      this.#db = null;
      this.#transactions = null;
      throw error;
    }
  }

  /**
   * better-sqlite3 is synchronous, so no cross-tick transaction can be
   * pending here; "complete pending transactions" is guaranteed by the
   * driver's execution model. Close still checkpoints + optimizes.
   */
  shutdown(): void {
    if (this.#db === null || !this.#db.isOpen) {
      this.#state = this.#state === 'idle' ? 'idle' : 'closed';
      return;
    }
    try {
      this.#writeAudit('database.stopped', null);
    } catch (error) {
      this.#log.warn(`Could not write shutdown audit entry: ${String(error)}`);
    }
    this.#log.info('Closing database');
    this.#db.close();
    this.#db = null;
    this.#transactions = null;
    this.#state = 'closed';
  }

  get state(): DatabaseState {
    return this.#state;
  }

  get paths(): DatabasePaths {
    return this.#paths;
  }

  get deviceId(): string {
    if (this.#deviceId === null) {
      throw new ConnectionError('Database is not initialized');
    }
    return this.#deviceId;
  }

  get connection(): SqliteDatabase {
    if (this.#db === null || this.#state !== 'ready') {
      throw new ConnectionError('Database is not ready');
    }
    return this.#db.raw;
  }

  get transactions(): TransactionManager {
    if (this.#transactions === null || this.#state !== 'ready') {
      throw new ConnectionError('Database is not ready');
    }
    return this.#transactions;
  }

  #writeAudit(event: string, details: object | null): void {
    try {
      this.#db?.raw
        .prepare(
          `INSERT INTO ${TableNames.auditLog} (id, category, event, details, createdAt)
           VALUES (?, 'database', ?, ?, ?)`,
        )
        .run(newId(), event, details === null ? null : JSON.stringify(details), nowIso());
    } catch (error) {
      throw wrapSqliteError(error, 'audit write');
    }
  }
}
