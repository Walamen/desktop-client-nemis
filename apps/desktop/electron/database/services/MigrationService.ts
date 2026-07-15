import type { Database as SqliteDatabase } from 'better-sqlite3';
import { MigrationError } from '../errors/errors';
import { nowIso } from '../helpers/time';
import type { Migration } from '../migrations/types';
import { TableNames } from '../schema/tableNames';

export interface AppliedMigration {
  version: number;
  name: string;
  appliedAt: string;
  durationMs: number;
}

const CREATE_HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TableNames.schemaMigrations} (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    appliedAt TEXT NOT NULL,
    durationMs INTEGER NOT NULL
  )
`;

/**
 * Versioned, transactional migrations with recorded history.
 * Each migration (DDL + history row + user_version bump) is one transaction:
 * a failure leaves the database exactly at the previous version.
 */
export class MigrationService {
  readonly #db: SqliteDatabase;
  readonly #registry: readonly Migration[];

  constructor(db: SqliteDatabase, registry: readonly Migration[]) {
    this.#db = db;
    this.#registry = registry;
  }

  migrateToLatest(): AppliedMigration[] {
    this.#db.exec(CREATE_HISTORY_TABLE);
    this.#validateRegistry();
    this.#validateHistory();
    const current = this.currentVersion();
    const pending = this.#registry.filter((m) => m.version > current);
    const applied: AppliedMigration[] = [];
    for (const migration of pending) {
      applied.push(this.#apply(migration));
    }
    return applied;
  }

  rollbackLast(): AppliedMigration | null {
    this.#db.exec(CREATE_HISTORY_TABLE);
    const history = this.appliedMigrations();
    const last = history.at(-1);
    if (!last) {
      return null;
    }
    const migration = this.#registry.find((m) => m.version === last.version);
    if (!migration) {
      throw new MigrationError(`Cannot roll back v${last.version}: not in the registry`);
    }
    const down = migration.down?.bind(migration);
    if (!down) {
      throw new MigrationError(`Cannot roll back v${last.version} (${last.name}): no down()`);
    }
    const previousVersion = history.at(-2)?.version ?? 0;
    try {
      this.#db.transaction(() => {
        down(this.#db);
        this.#db
          .prepare(`DELETE FROM ${TableNames.schemaMigrations} WHERE version = ?`)
          .run(last.version);
        this.#db.pragma(`user_version = ${previousVersion}`);
      })();
    } catch (error) {
      throw new MigrationError(`Rollback of v${last.version} (${last.name}) failed`, {
        cause: error,
      });
    }
    return last;
  }

  appliedMigrations(): AppliedMigration[] {
    return this.#db
      .prepare(
        `SELECT version, name, appliedAt, durationMs
         FROM ${TableNames.schemaMigrations} ORDER BY version`,
      )
      .all() as AppliedMigration[];
  }

  currentVersion(): number {
    const row = this.#db
      .prepare(`SELECT MAX(version) AS version FROM ${TableNames.schemaMigrations}`)
      .get() as { version: number | null };
    return row.version ?? 0;
  }

  #apply(migration: Migration): AppliedMigration {
    const start = performance.now();
    const appliedAt = nowIso();
    try {
      this.#db.transaction(() => {
        migration.up(this.#db);
        const durationMs = Math.round(performance.now() - start);
        this.#db
          .prepare(
            `INSERT INTO ${TableNames.schemaMigrations} (version, name, appliedAt, durationMs)
             VALUES (?, ?, ?, ?)`,
          )
          .run(migration.version, migration.name, appliedAt, durationMs);
        this.#db.pragma(`user_version = ${migration.version}`);
      })();
    } catch (error) {
      throw new MigrationError(`Migration v${migration.version} (${migration.name}) failed`, {
        cause: error,
      });
    }
    return {
      version: migration.version,
      name: migration.name,
      appliedAt,
      durationMs: Math.round(performance.now() - start),
    };
  }

  #validateRegistry(): void {
    let previous = 0;
    const seen = new Set<number>();
    for (const migration of this.#registry) {
      if (!Number.isInteger(migration.version) || migration.version < 1) {
        throw new MigrationError(`Invalid migration version: ${migration.version}`);
      }
      if (seen.has(migration.version) || migration.version <= previous) {
        throw new MigrationError(
          `Migration registry must be strictly ascending; problem at v${migration.version}`,
        );
      }
      seen.add(migration.version);
      previous = migration.version;
    }
  }

  /** Every applied migration must still exist in the registry (same version+name). */
  #validateHistory(): void {
    const byVersion = new Map(this.#registry.map((m) => [m.version, m]));
    for (const applied of this.appliedMigrations()) {
      const match = byVersion.get(applied.version);
      if (!match || match.name !== applied.name) {
        throw new MigrationError(
          `History drift: applied v${applied.version} (${applied.name}) is missing from the registry`,
        );
      }
    }
  }
}
