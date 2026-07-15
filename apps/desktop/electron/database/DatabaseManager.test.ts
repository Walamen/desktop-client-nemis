import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from './DatabaseManager';
import { ConnectionError } from './errors/errors';
import { TableNames } from './schema/tableNames';
import type { DeviceInfo } from './seed/initializeMetadata';

const device: DeviceInfo = {
  deviceName: 'test-device',
  platform: 'win32',
  osVersion: '10.0.19045',
  appVersion: '1.0.0',
};

describe('DatabaseManager', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-manager-test-'));
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('initialize() runs the full lifecycle to ready', () => {
    const manager = new DatabaseManager({ userDataDir, device });
    manager.initialize();
    try {
      expect(manager.state).toBe('ready');
      expect(manager.deviceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(fs.existsSync(manager.paths.databaseFile)).toBe(true);
      const audit = manager.connection
        .prepare(`SELECT event FROM ${TableNames.auditLog} WHERE category = 'database'`)
        .all() as Array<{ event: string }>;
      expect(audit.map((a) => a.event)).toContain('database.started');
    } finally {
      manager.shutdown();
    }
  });

  it('initialize() and shutdown() are idempotent; connection access after close throws', () => {
    const manager = new DatabaseManager({ userDataDir, device });
    manager.initialize();
    manager.initialize(); // no-op
    manager.shutdown();
    manager.shutdown(); // no-op
    expect(manager.state).toBe('closed');
    expect(() => manager.connection).toThrow(ConnectionError);
  });

  it('persists across restarts: same device id, no duplicate migrations', () => {
    const first = new DatabaseManager({ userDataDir, device });
    first.initialize();
    const deviceId = first.deviceId;
    first.shutdown();

    const second = new DatabaseManager({ userDataDir, device });
    second.initialize();
    try {
      expect(second.deviceId).toBe(deviceId);
      const history = second.connection
        .prepare(`SELECT COUNT(*) AS n FROM ${TableNames.schemaMigrations}`)
        .get() as { n: number };
      expect(history.n).toBe(1);
    } finally {
      second.shutdown();
    }
  });

  it('fails to ready and leaves no open connection when the db file is corrupt', () => {
    const manager = new DatabaseManager({ userDataDir, device });
    const dbFile = manager.paths.databaseFile;
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    fs.writeFileSync(dbFile, 'garbage that is not sqlite');
    expect(() => manager.initialize()).toThrow();
    expect(manager.state).toBe('failed');
    expect(() => manager.connection).toThrow(ConnectionError);
  });
});
