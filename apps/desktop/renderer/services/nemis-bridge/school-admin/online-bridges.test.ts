import { afterEach, describe, expect, it, vi } from 'vitest';
import { registryBridge, parseIpcErrorCode } from './registry-bridge';
import { transferBridge } from './transfer-bridge';

afterEach(() => {
  delete (window as { nemis?: unknown }).nemis;
});

describe('online bridges', () => {
  it('route to window.nemis.registry and window.nemis.transfer', async () => {
    const registry = {
      lookup: vi.fn(async () => ({ found: false })),
      claim: vi.fn(async () => ({ data: { studentId: 's' }, refreshed: true })),
      request: vi.fn(async () => ({ data: { id: 't' }, refreshed: true })),
    };
    const transfer = {
      create: vi.fn(async () => ({ data: { id: 'a' }, refreshed: true })),
      review: vi.fn(async () => ({ data: { id: 'b' }, refreshed: false })),
      cancel: vi.fn(async (id: string) => ({ data: { id }, refreshed: true })),
    };
    (window as { nemis?: unknown }).nemis = { registry, transfer };

    expect(await registryBridge.lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' })).toEqual({ found: false });
    expect(await transferBridge.cancelTransfer('t-1')).toEqual({ data: { id: 't-1' }, refreshed: true });
    expect(registry.lookup).toHaveBeenCalledWith({ nemisId: '482915736045', dateOfBirth: '2012-01-01' });
    expect(transfer.cancel).toHaveBeenCalledWith('t-1');
  });

  it('parseIpcErrorCode reads the [CODE] prefix and ignores anything else', () => {
    expect(parseIpcErrorCode(new Error("[OFFLINE] You're offline. Connect to the internet to do this."))).toBe('OFFLINE');
    expect(parseIpcErrorCode(new Error('[REMOTE_REJECTED] Transfer request not found'))).toBe('REMOTE_REJECTED');
    expect(parseIpcErrorCode(new Error('[NOT_A_CODE] x'))).toBeNull();
    expect(parseIpcErrorCode(new Error('no prefix'))).toBeNull();
    expect(parseIpcErrorCode('string')).toBeNull();
  });
});
