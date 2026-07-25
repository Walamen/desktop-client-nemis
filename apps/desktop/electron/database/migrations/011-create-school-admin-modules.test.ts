import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../DatabaseManager';

const TABLES = [
  'student_transfers',
  'institution_grading_configs',
  'grading_periods',
  'grade_entry_windows',
  'grade_entry_window_classes',
  'grades',
  'fee_rules',
  'fee_obligations',
  'fee_payments',
  'announcements',
  'conversations',
  'messages',
  'user_notifications',
  'reports',
  'alerts',
] as const;

describe('school admin module migration', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-school-admin-modules-'));
    manager = new DatabaseManager({
      userDataDir: directory,
      device: {
        deviceName: 'Test PC',
        platform: 'win32',
        osVersion: '11',
        appVersion: '1.0.0',
      },
    });
    manager.initialize();
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('creates every school-admin collection with create, update, and delete outbox triggers', () => {
    const tables = manager.connection.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN (${TABLES.map(() => '?').join(',')})
    `).all(...TABLES) as Array<{ name: string }>;
    expect(tables.map((row) => row.name).sort()).toEqual([...TABLES].sort());

    const triggers = manager.connection.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='trigger' AND tbl_name IN (${TABLES.map(() => '?').join(',')})
    `).all(...TABLES) as Array<{ name: string }>;
    expect(triggers).toHaveLength(TABLES.length * 3);
    for (const table of TABLES) {
      expect(triggers.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          `outbox_${table}_insert`,
          `outbox_${table}_update`,
          `outbox_${table}_delete`,
        ]),
      );
    }
  });
});
