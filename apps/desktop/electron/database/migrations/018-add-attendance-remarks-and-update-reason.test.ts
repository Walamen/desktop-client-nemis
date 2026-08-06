import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../DatabaseManager';

describe('add-attendance-remarks-and-update-reason migration', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-attendance-cols-'));
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

  it('accepts remarks and updateReason on an attendance row', () => {
    manager.connection.prepare(`
      INSERT INTO attendance
        (id,studentId,classId,subjectId,date,status,recordedBy,remarks,updateReason,version,updatedAt)
      VALUES ('att-1','student-1','class-1','subject-1','2026-01-05','PRESENT','staff-1','Late arrival','Correcting register mix-up',1,?)
    `).run('2026-01-05T00:00:00.000Z');

    const row = manager.connection
      .prepare(`SELECT remarks, updateReason FROM attendance WHERE id = 'att-1'`)
      .get() as { remarks: string; updateReason: string };
    expect(row.remarks).toBe('Late arrival');
    expect(row.updateReason).toBe('Correcting register mix-up');
  });

  it('captures the new columns in the outbox payload after trigger regeneration', () => {
    manager.connection.prepare(`
      INSERT INTO attendance
        (id,studentId,classId,subjectId,date,status,recordedBy,remarks,updateReason,version,updatedAt)
      VALUES ('att-2','student-1','class-1','subject-1','2026-01-05','ABSENT',NULL,'Sick note',NULL,1,?)
    `).run('2026-01-05T00:00:00.000Z');

    const row = manager.connection
      .prepare(`SELECT payload FROM sync_queue WHERE entityType='attendance' AND entityId='att-2'`)
      .get() as { payload: string };
    expect(JSON.parse(row.payload)).toMatchObject({
      record: { id: 'att-2', subjectId: 'subject-1', remarks: 'Sick note' },
    });
  });
});
