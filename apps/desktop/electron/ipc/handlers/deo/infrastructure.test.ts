import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoInfrastructureHandlers } from './infrastructure';

function makeHarness() {
  const calls = new Map<string, { validate: IpcValidator; handler: (...args: readonly unknown[]) => unknown }>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as (...args: readonly unknown[]) => unknown });
  }) as IpcHandle;
  return { calls, handle };
}

describe('deo infrastructure IPC handlers', () => {
  it('deo:infrastructure returns the data and rejects arguments', async () => {
    const { calls, handle } = makeHarness();
    const payload = { issues: [] };
    registerDeoInfrastructureHandlers(handle, {
      deo: { getInfrastructure: async () => ({ data: payload }) },
    } as unknown as ApplicationLayer);
    const call = calls.get('deo:infrastructure')!;
    expect(await call.handler()).toEqual(payload);
    expect(() => call.validate([])).not.toThrow();
    expect(() => call.validate(['x'])).toThrow(IPCError);
  });

  it.each([
    ['deo:infrastructure-review', 'reviewInfrastructure'],
    ['deo:infrastructure-resolve', 'resolveInfrastructure'],
  ])('%s forwards the request and returns the outcome', async (channel, method) => {
    const { calls, handle } = makeHarness();
    const seen: unknown[] = [];
    registerDeoInfrastructureHandlers(handle, {
      deo: {
        [method]: async (req: unknown) => {
          seen.push(req);
          return { data: true };
        },
      },
    } as unknown as ApplicationLayer);
    const call = calls.get(channel)!;
    expect(() => call.validate([{ issueId: 'i-1', comments: 'ok' }])).not.toThrow();
    expect(() => call.validate([{ issueId: 'i-1' }])).not.toThrow();
    expect(await call.handler({ issueId: 'i-1', comments: 'ok' })).toBe(true);
    expect(seen).toEqual([{ issueId: 'i-1', comments: 'ok' }]);
    expect(() => call.validate([{ issueId: 'i-1', extra: 1 }])).toThrow(IPCError);
    expect(() => call.validate([{ issueId: '' }])).toThrow(IPCError);
    expect(() => call.validate([{ issueId: 'i-1', comments: 'x'.repeat(2001) }])).toThrow(IPCError);
    expect(() => call.validate([])).toThrow(IPCError);
  });

  it('deo:infrastructure-escalate forwards and validates the reason', async () => {
    const { calls, handle } = makeHarness();
    const seen: unknown[] = [];
    registerDeoInfrastructureHandlers(handle, {
      deo: {
        escalateInfrastructure: async (req: unknown) => {
          seen.push(req);
          return { data: true };
        },
      },
    } as unknown as ApplicationLayer);
    const call = calls.get('deo:infrastructure-escalate')!;
    expect(() => call.validate([{ issueId: 'i-1', reason: 'Roof collapsed' }])).not.toThrow();
    expect(await call.handler({ issueId: 'i-1', reason: 'Roof collapsed' })).toBe(true);
    expect(seen).toEqual([{ issueId: 'i-1', reason: 'Roof collapsed' }]);
    expect(() => call.validate([{ issueId: 'i-1', reason: ' ' }])).toThrow(IPCError);
    expect(() => call.validate([{ issueId: 'i-1' }])).toThrow(IPCError);
    expect(() => call.validate([{ issueId: 'i-1', reason: 'x'.repeat(2001) }])).toThrow(IPCError);
    expect(() => call.validate([{ issueId: 'i-1', reason: 'r', comments: 'c' }])).toThrow(IPCError);
  });
});
