import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { MigrationError } from '../errors/errors';
import type { Migration } from '../migrations/types';
import { createTestDatabase, type TestDatabase } from '../testing/createTestDatabase';
import { MigrationService } from './MigrationService';

const m1: Migration = {
  version: 1,
  name: 'create-alpha',
  up: (db: SqliteDatabase) => {
    db.exec('CREATE TABLE alpha (id TEXT PRIMARY KEY)');
  },
  down: (db: SqliteDatabase) => {
    db.exec('DROP TABLE alpha');
  },
};

const m2: Migration = {
  version: 2,
  name: 'create-beta',
  up: (db: SqliteDatabase) => {
    db.exec('CREATE TABLE beta (id TEXT PRIMARY KEY)');
  },
};

describe('MigrationService', () => {
  let test: TestDatabase;

  beforeEach(() => {
    test = createTestDatabase();
  });

  afterEach(() => {
    test.cleanup();
  });

  it('applies pending migrations in order and records history', () => {
    const service = new MigrationService(test.db.raw, [m1, m2]);
    const applied = service.migrateToLatest();
    expect(applied.map((m) => m.version)).toEqual([1, 2]);
    expect(service.currentVersion()).toBe(2);
    expect(test.db.raw.pragma('user_version', { simple: true })).toBe(2);
    const history = service.appliedMigrations();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ version: 1, name: 'create-alpha' });
  });

  it('is idempotent: second run applies nothing', () => {
    const service = new MigrationService(test.db.raw, [m1, m2]);
    service.migrateToLatest();
    expect(service.migrateToLatest()).toEqual([]);
  });

  it('rolls back the whole migration when up() throws mid-way', () => {
    const bad: Migration = {
      version: 1,
      name: 'bad',
      up: (db: SqliteDatabase) => {
        db.exec('CREATE TABLE gamma (id TEXT PRIMARY KEY)');
        throw new Error('boom');
      },
    };
    const service = new MigrationService(test.db.raw, [bad]);
    expect(() => service.migrateToLatest()).toThrow(MigrationError);
    expect(service.currentVersion()).toBe(0);
    const table = test.db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gamma'")
      .get();
    expect(table).toBeUndefined();
  });

  it('rejects an invalid registry (duplicate or non-ascending versions)', () => {
    expect(() => new MigrationService(test.db.raw, [m2, m1]).migrateToLatest()).toThrow(
      MigrationError,
    );
    expect(() =>
      new MigrationService(test.db.raw, [m1, { ...m2, version: 1 }]).migrateToLatest(),
    ).toThrow(MigrationError);
  });

  it('detects drift: applied migration missing from the registry', () => {
    new MigrationService(test.db.raw, [m1]).migrateToLatest();
    expect(() => new MigrationService(test.db.raw, [m2]).migrateToLatest()).toThrow(MigrationError);
  });

  it('rollbackLast() reverses the last migration when down() exists', () => {
    const service = new MigrationService(test.db.raw, [m1]);
    service.migrateToLatest();
    const rolledBack = service.rollbackLast();
    expect(rolledBack?.version).toBe(1);
    expect(service.currentVersion()).toBe(0);
  });

  it('rollbackLast() refuses when the migration has no down()', () => {
    const service = new MigrationService(test.db.raw, [m1, m2]);
    service.migrateToLatest();
    expect(() => service.rollbackLast()).toThrow(MigrationError);
  });
});
