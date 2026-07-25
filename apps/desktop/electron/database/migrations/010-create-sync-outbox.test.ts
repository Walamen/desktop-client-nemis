import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../DatabaseManager';

describe('sync outbox migration', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-outbox-'));
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
    manager.connection.prepare(`
      INSERT INTO institutions
        (id,code,name,type,ownership,countyId,approvalStatus,version,updatedAt)
      VALUES ('school-1','SCH-1','School','SECONDARY','PUBLIC','county-1','APPROVED',1,?)
    `).run('2026-01-01T00:00:00.000Z');
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('captures create and update payloads with the original base row', () => {
    manager.connection.prepare(`
      INSERT INTO subjects
        (id,institutionId,name,code,description,isActive,version,updatedAt)
      VALUES ('subject-1','school-1','Math','MATH',NULL,1,1,?)
    `).run('2026-01-01T00:00:00.000Z');
    manager.connection.prepare(`
      UPDATE subjects SET name='Mathematics',version=2,updatedAt=? WHERE id='subject-1'
    `).run('2026-01-02T00:00:00.000Z');

    const rows = manager.connection.prepare(`
      SELECT operationType,payload FROM sync_queue
      WHERE entityType='subjects' ORDER BY createdAt,id
    `).all() as Array<{ operationType: string; payload: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.operationType).toBe('create');
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({
      record: { id: 'subject-1', name: 'Math', version: 1 },
    });
    expect(rows[1]?.operationType).toBe('update');
    expect(JSON.parse(rows[1]!.payload)).toMatchObject({
      base: { name: 'Math', version: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
      record: {
        name: 'Mathematics',
        version: 2,
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('suppresses capture while a server snapshot is being applied', () => {
    manager.connection.prepare(
      `UPDATE sync_runtime SET captureEnabled=0 WHERE id='singleton'`,
    ).run();
    manager.connection.prepare(`
      INSERT INTO subjects
        (id,institutionId,name,code,description,isActive,version,updatedAt)
      VALUES ('subject-1','school-1','Math','MATH',NULL,1,1,?)
    `).run('2026-01-01T00:00:00.000Z');
    const count = manager.connection.prepare(
      `SELECT COUNT(*) count FROM sync_queue`,
    ).get() as { count: number };
    expect(count.count).toBe(0);
  });
});
