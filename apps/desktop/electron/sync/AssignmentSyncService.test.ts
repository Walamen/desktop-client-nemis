import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext, type TestContext } from '../data/testing/createTestContext';
import type { BackendProvisioningGateway } from '../provisioning/BackendProvisioningGateway';
import { AssignmentSyncService } from './AssignmentSyncService';

function buildGateway(): BackendProvisioningGateway {
  return {
    createAssignment: vi.fn(async () => ({ id: 'remote-a1' })),
    updateAssignment: vi.fn(async () => ({ id: 'remote-a1' })),
    gradeSubmission: vi.fn(async () => undefined),
  } as unknown as BackendProvisioningGateway;
}

describe('AssignmentSyncService', () => {
  let test: TestContext;

  beforeEach(() => {
    test = createTestContext();
  });
  afterEach(() => test.cleanup());

  function insertAssignment(overrides: Partial<{
    id: string; remoteId: string | null; status: string; syncedAt: string | null; updatedAt: string;
  }> = {}) {
    const row = {
      id: 'a1', remoteId: null, status: 'DRAFT', syncedAt: null, updatedAt: '2026-08-01T00:00:00.000Z',
      ...overrides,
    };
    test.context.connection.prepare(`
      INSERT INTO assignments (id,classId,subjectId,teacherId,title,type,status,dueDate,createdAt,updatedAt,remoteId,syncedAt)
      VALUES (?,'cls-1',NULL,'staff-1','Chapter 5','HOMEWORK',?,'2026-08-10',?,?,?,?)
    `).run(row.id, row.status, row.updatedAt, row.updatedAt, row.remoteId, row.syncedAt);
  }

  it('creates a never-synced assignment remotely and stores the returned remoteId', async () => {
    insertAssignment();
    const gateway = buildGateway();
    await new AssignmentSyncService(gateway).pushPending(test.context.connection);

    expect(gateway.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'cls-1', title: 'Chapter 5', status: 'DRAFT' }),
      undefined,
    );
    const row = test.context.connection.prepare(`SELECT remoteId, syncedAt FROM assignments WHERE id='a1'`).get() as {
      remoteId: string; syncedAt: string;
    };
    expect(row.remoteId).toBe('remote-a1');
    expect(row.syncedAt).toBeTruthy();
  });

  it('updates (not creates) an assignment that already has a remoteId', async () => {
    insertAssignment({ remoteId: 'remote-a1', syncedAt: '2026-07-01T00:00:00.000Z' });
    const gateway = buildGateway();
    await new AssignmentSyncService(gateway).pushPending(test.context.connection);

    expect(gateway.updateAssignment).toHaveBeenCalledWith('remote-a1', expect.any(Object), undefined);
    expect(gateway.createAssignment).not.toHaveBeenCalled();
  });

  it('skips an assignment that is already synced (syncedAt >= updatedAt)', async () => {
    insertAssignment({ remoteId: 'remote-a1', syncedAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' });
    const gateway = buildGateway();
    await new AssignmentSyncService(gateway).pushPending(test.context.connection);
    expect(gateway.updateAssignment).not.toHaveBeenCalled();
  });

  it('a failed push leaves the row dirty for the next cycle, without throwing', async () => {
    insertAssignment();
    const gateway = buildGateway();
    (gateway.createAssignment as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    await expect(new AssignmentSyncService(gateway).pushPending(test.context.connection)).resolves.toBeUndefined();
    const row = test.context.connection.prepare(`SELECT syncedAt FROM assignments WHERE id='a1'`).get() as {
      syncedAt: string | null;
    };
    expect(row.syncedAt).toBeNull();
  });

  it('pushes a dirty grade once its assignment has a remoteId, and skips it otherwise', async () => {
    // a1 is not itself dirty this cycle (already "synced" — synthetic here
    // just to isolate the submissions query) but still has no remoteId, so
    // its grade must keep waiting rather than push against a non-existent
    // remote assignment.
    insertAssignment({ id: 'a1', remoteId: null, syncedAt: '2026-08-01T00:00:00.000Z' });
    insertAssignment({ id: 'a2', remoteId: 'remote-a2', syncedAt: '2026-08-01T00:00:00.000Z' });
    test.context.connection.prepare(`
      INSERT INTO assignment_submissions (id,assignmentId,studentId,status,grade,feedback,createdAt,updatedAt,syncedAt)
      VALUES ('s1','a1','stu-1','GRADED',90,'Great',?,?,NULL)
    `).run('2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z');
    test.context.connection.prepare(`
      INSERT INTO assignment_submissions (id,assignmentId,studentId,status,grade,feedback,createdAt,updatedAt,syncedAt)
      VALUES ('s2','a2','stu-2','GRADED',80,NULL,?,?,NULL)
    `).run('2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z');

    const gateway = buildGateway();
    await new AssignmentSyncService(gateway).pushPending(test.context.connection);

    // s1's assignment (a1) has no remoteId yet — its grade must wait.
    expect(gateway.gradeSubmission).toHaveBeenCalledTimes(1);
    expect(gateway.gradeSubmission).toHaveBeenCalledWith('remote-a2', 'stu-2', { grade: 80, feedback: undefined });
    const s2 = test.context.connection.prepare(`SELECT syncedAt FROM assignment_submissions WHERE id='s2'`).get() as {
      syncedAt: string | null;
    };
    expect(s2.syncedAt).toBeTruthy();
    const s1 = test.context.connection.prepare(`SELECT syncedAt FROM assignment_submissions WHERE id='s1'`).get() as {
      syncedAt: string | null;
    };
    expect(s1.syncedAt).toBeNull();
  });
});
