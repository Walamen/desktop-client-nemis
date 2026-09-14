import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '../DatabaseManager';

describe('add-term-sequence migration', () => {
  let directory: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-term-sequence-'));
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
      INSERT INTO academic_years (id, institutionId, code, startDate, endDate, isCurrent, version, updatedAt)
      VALUES ('ay-1', 'inst-1', '2025/2026', '2025-09-01', '2026-07-31', 1, 1, '2025-08-01T00:00:00.000Z')
    `).run();
  });

  afterEach(() => {
    manager.shutdown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('accepts a sequence value on a term row', () => {
    manager.connection.prepare(`
      INSERT INTO terms (id, academicYearId, name, sequence, startDate, endDate, isCurrent, version, updatedAt)
      VALUES ('t-1', 'ay-1', 'Term 1', 1, '2025-09-01', '2025-12-19', 0, 1, ?)
    `).run('2025-08-05T00:00:00.000Z');

    const row = manager.connection.prepare(`SELECT sequence FROM terms WHERE id = 't-1'`).get() as { sequence: number };
    expect(row.sequence).toBe(1);
  });

  it('rejects two terms in the same year claiming the same position', () => {
    manager.connection.prepare(`
      INSERT INTO terms (id, academicYearId, name, sequence, startDate, endDate, isCurrent, version, updatedAt)
      VALUES ('t-1', 'ay-1', 'Term 1', 1, '2025-09-01', '2025-12-19', 0, 1, ?)
    `).run('2025-08-05T00:00:00.000Z');

    expect(() =>
      manager.connection.prepare(`
        INSERT INTO terms (id, academicYearId, name, sequence, startDate, endDate, isCurrent, version, updatedAt)
        VALUES ('t-2', 'ay-1', 'Term Two', 1, '2026-01-05', '2026-04-01', 0, 1, ?)
      `).run('2025-08-05T00:00:00.000Z'),
    ).toThrow();
  });

  it('captures the new column in the outbox payload after trigger regeneration', () => {
    manager.connection.prepare(`
      INSERT INTO terms (id, academicYearId, name, sequence, startDate, endDate, isCurrent, version, updatedAt)
      VALUES ('t-1', 'ay-1', 'Term 1', 1, '2025-09-01', '2025-12-19', 0, 1, ?)
    `).run('2025-08-05T00:00:00.000Z');

    const row = manager.connection
      .prepare(`SELECT payload FROM sync_queue WHERE entityType='terms' AND entityId='t-1'`)
      .get() as { payload: string };
    expect(JSON.parse(row.payload)).toMatchObject({ record: { id: 't-1', sequence: 1 } });
  });
});
