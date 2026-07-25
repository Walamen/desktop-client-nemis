import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { Migration } from './types';

export const createProvisioningMetadata: Migration = {
  version: 6,
  name: 'create-provisioning-metadata',
  up(db: SqliteDatabase): void {
    db.exec(`
      CREATE TABLE provisioning_metadata (
        id TEXT PRIMARY KEY CHECK (id = 'singleton'),
        status TEXT NOT NULL CHECK (status IN ('in_progress', 'complete', 'failed')),
        institutionId TEXT,
        userId TEXT,
        serverDeviceId TEXT,
        snapshotId TEXT,
        checksum TEXT,
        startedAt TEXT NOT NULL,
        completedAt TEXT,
        updatedAt TEXT NOT NULL,
        lastError TEXT
      );
      CREATE INDEX idx_provisioning_status ON provisioning_metadata (status);
    `);
  },
  down(db: SqliteDatabase): void {
    db.exec('DROP TABLE provisioning_metadata;');
  },
};
