import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../DatabaseManager';

describe('drop-dead-assignment-outbox-triggers migration', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-assignment-triggers-'));
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

  it('removes the assignments/assignment_submissions outbox triggers', () => {
    const triggers = manager.connection
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='trigger' AND
         (name LIKE 'outbox_assignments_%' OR name LIKE 'outbox_assignment_submissions_%')`,
      )
      .all();
    expect(triggers).toEqual([]);
  });

  it('does not touch class_resources outbox triggers (unrelated feature)', () => {
    const triggers = manager.connection
      .prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'outbox_class_resources_%'`)
      .all();
    expect(triggers).toHaveLength(3);
  });

  it('inserting into assignments no longer queues a sync_queue row', () => {
    manager.connection.prepare(`
      INSERT INTO assignments
        (id,classId,subjectId,teacherId,title,type,status,instructions,dueDate,totalMarks,createdAt,updatedAt)
      VALUES ('a1','class-1',NULL,'staff-1','Ch 5 Homework','HOMEWORK','DRAFT',NULL,'2026-08-10',NULL,?,?)
    `).run('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    const count = manager.connection
      .prepare(`SELECT COUNT(*) count FROM sync_queue WHERE entityType='assignments'`)
      .get() as { count: number };
    expect(count.count).toBe(0);
  });
});
