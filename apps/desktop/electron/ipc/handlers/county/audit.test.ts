import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { authorizeChannel } from '@app/ipc/authorizeChannel';
import { registerCountyAuditHandlers } from './audit';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function setup() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const county = {
    getAuditStats: vi.fn(async () => ({ data: { total: 3 } })),
    listAuditLogs: vi.fn(async () => ({ data: { items: [], total: 0, page: 1, limit: 50 } })),
    getCountySettings: vi.fn(async () => ({ data: { county: null, districtCount: 0, schoolCount: 0 } })),
  };
  registerCountyAuditHandlers(handle, { county } as unknown as ApplicationLayer);
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { county, call };
}

describe('county audit + settings channels', () => {
  it('each channel forwards to the County application service and returns its data', async () => {
    const { county, call } = setup();
    expect(await call('county:audit-stats')).toEqual({ total: 3 });
    const query = { search: 'jam', action: 'CREATE', entityType: 'Staff', page: 2, limit: 50 };
    expect(await call('county:audit-list', query)).toEqual({ items: [], total: 0, page: 1, limit: 50 });
    expect(county.listAuditLogs).toHaveBeenCalledWith(query);
    expect(await call('county:settings')).toEqual({ county: null, districtCount: 0, schoolCount: 0 });
  });

  it('rejects malformed audit queries', () => {
    const { call } = setup();
    expect(() => call('county:audit-list', { page: 0, limit: 50 })).toThrow(IPCError);
    expect(() => call('county:audit-list', { page: 1, limit: 101 })).toThrow(IPCError);
    expect(() => call('county:audit-list', { page: 1, limit: 50, search: 'x'.repeat(201) })).toThrow(IPCError);
    expect(() => call('county:audit-list', { page: 1, limit: 50, extra: 1 })).toThrow(IPCError);
    expect(() => call('county:audit-stats', 'x')).toThrow(IPCError);
  });

  it('only County Admin workspaces may use them', () => {
    for (const channel of ['county:audit-stats', 'county:audit-list', 'county:settings'] as IpcChannel[]) {
      const workspace = (role: string) => ({ active: { user: { role } } }) as never;
      expect(() => authorizeChannel(channel, workspace('INSTITUTION_ADMIN'))).toThrow(/county administrator/);
      expect(() => authorizeChannel(channel, workspace('COUNTY_ADMIN'))).not.toThrow();
    }
  });
});
