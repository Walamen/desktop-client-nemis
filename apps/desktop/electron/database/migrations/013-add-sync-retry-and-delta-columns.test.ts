import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../DatabaseManager';

describe('sync retry and delta columns migration', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-sync-delta-'));
    manager = new DatabaseManager({
      userDataDir: directory,
      device: { deviceName: 'Test PC', platform: 'win32', osVersion: '11', appVersion: '1.0.0' },
    });
    manager.initialize();
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('adds nextAttemptAt and deadLetter to sync_queue with a safe default', () => {
    manager.connection.prepare(`
      INSERT INTO sync_queue (id,entityType,entityId,operationType,payload,retryCount,status,createdAt,updatedAt)
      VALUES ('q1','students','s1','create',NULL,0,'pending',?,?)
    `).run('2026-07-29T00:00:00.000Z', '2026-07-29T00:00:00.000Z');
    const row = manager.connection
      .prepare(`SELECT nextAttemptAt, deadLetter FROM sync_queue WHERE id='q1'`)
      .get() as { nextAttemptAt: string | null; deadLetter: number };
    expect(row.nextAttemptAt).toBeNull();
    expect(row.deadLetter).toBe(0);
  });

  it('adds lastDeltaAt and lastFullResyncAt to sync_metadata', () => {
    const columns = manager.connection.prepare(`PRAGMA table_info(sync_metadata)`).all() as Array<{
      name: string;
    }>;
    const names = columns.map((c) => c.name);
    expect(names).toContain('lastDeltaAt');
    expect(names).toContain('lastFullResyncAt');
  });
});
