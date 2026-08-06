import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../DatabaseManager';

describe('add-assignment-sync-tracking migration', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-assignment-sync-'));
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

  it('accepts remoteId and syncedAt on assignments', () => {
    manager.connection.prepare(`
      INSERT INTO assignments (id,classId,subjectId,teacherId,title,type,status,dueDate,createdAt,updatedAt,remoteId,syncedAt)
      VALUES ('a1','cls-1',NULL,'staff-1','Ch5','HOMEWORK','DRAFT','2026-08-10',?,?,'remote-a1',?)
    `).run('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T01:00:00.000Z');
    const row = manager.connection.prepare(`SELECT remoteId, syncedAt FROM assignments WHERE id='a1'`).get() as {
      remoteId: string;
      syncedAt: string;
    };
    expect(row.remoteId).toBe('remote-a1');
    expect(row.syncedAt).toBe('2026-08-01T01:00:00.000Z');
  });

  it('accepts syncedAt on assignment_submissions', () => {
    manager.connection.prepare(`
      INSERT INTO assignment_submissions (id,assignmentId,studentId,status,createdAt,updatedAt,syncedAt)
      VALUES ('s1','a1','stu-1','GRADED',?,?,?)
    `).run('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T01:00:00.000Z');
    const row = manager.connection.prepare(`SELECT syncedAt FROM assignment_submissions WHERE id='s1'`).get() as {
      syncedAt: string;
    };
    expect(row.syncedAt).toBe('2026-08-01T01:00:00.000Z');
  });
});
