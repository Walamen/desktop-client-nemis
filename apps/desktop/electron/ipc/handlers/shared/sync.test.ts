import { describe, expect, it, vi } from 'vitest';
import type { IpcChannel } from '@nemis-desktop/types';
import { IpcChannels } from '@nemis-desktop/types';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import type { DesktopSyncWorker } from '@app/sync/DesktopSyncWorker';
import { registerSyncHandlers } from './sync';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function makeHarness() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

describe('registerSyncHandlers', () => {
  it('releases backoff, then forces a full sync, then reports status', async () => {
    const order: string[] = [];
    const worker = {
      releaseBackoff: vi.fn(() => order.push('release')),
      pullNow: vi.fn(async () => { order.push('pull'); return true; }),
      getStatus: vi.fn(() => { order.push('status'); return { pending: 0 }; }),
    } as unknown as DesktopSyncWorker;
    const { calls, handle } = makeHarness();
    registerSyncHandlers(handle, worker);
    expect(await calls.get(IpcChannels.SYNC_RUN)!.handler()).toEqual({ pending: 0 });
    expect(order).toEqual(['release', 'pull', 'status']);
    expect(worker.releaseBackoff).toHaveBeenCalledWith({ manual: true });
    expect(worker.pullNow).toHaveBeenCalledWith();
  });

  it('reports status instead of rejecting when the sync could not finish', async () => {
    const worker = {
      releaseBackoff: vi.fn(),
      pullNow: vi.fn(async () => false),
      getStatus: vi.fn(() => ({ status: 'failed' })),
    } as unknown as DesktopSyncWorker;
    const { calls, handle } = makeHarness();
    registerSyncHandlers(handle, worker);
    expect(await calls.get(IpcChannels.SYNC_RUN)!.handler()).toEqual({ status: 'failed' });
  });

  it('serves the pending summary and validated record pages', async () => {
    const listPending = vi.fn(() => ({ groups: [], total: 0, failedCount: 0, partial: false }));
    const listPendingRecords = vi.fn(() => ({ records: [], total: 0 }));
    const worker = { listPending, listPendingRecords } as unknown as DesktopSyncWorker;
    const { calls, handle } = makeHarness();
    registerSyncHandlers(handle, worker);

    const summary = calls.get(IpcChannels.SYNC_LIST_PENDING)!;
    expect(() => summary.validate(['x'])).toThrow();
    expect(await summary.handler()).toEqual({ groups: [], total: 0, failedCount: 0, partial: false });

    const records = calls.get(IpcChannels.SYNC_LIST_PENDING_RECORDS)!;
    const request = { groupKey: 'outbox:attendance', limit: 50, offset: 0 };
    expect(() => records.validate([{ ...request, limit: 999 }])).toThrow();
    await records.handler(request);
    expect(listPendingRecords).toHaveBeenCalledWith(request);
  });
});
