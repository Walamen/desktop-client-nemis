import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyFinanceHandlers } from './finance';

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
    getFinanceDashboard: vi.fn(async () => ({ data: { totalSchools: 3 } })),
    listFinanceSchools: vi.fn(async () => ({ data: [] })),
    listFeeCollections: vi.fn(async () => ({ data: { total: 4 } })),
    listFeeRules: vi.fn(async () => ({ data: { total: 2 } })),
  };
  registerCountyFinanceHandlers(handle, { county } as unknown as ApplicationLayer);
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { county, call };
}

describe('county finance channels', () => {
  it('each channel forwards to the County application service and returns its data', async () => {
    const { county, call } = setup();
    expect(await call('county:finance-dashboard')).toEqual({ totalSchools: 3 });
    expect(await call('county:finance-schools')).toEqual([]);
    const payments = { search: 'mary', districtId: 'd-1', ownership: 'PRIVATE', page: 2, limit: 50 };
    expect(await call('county:finance-payments', payments)).toEqual({ total: 4 });
    expect(county.listFeeCollections).toHaveBeenCalledWith(payments);
    const rules = { search: 'alpha', ownership: 'MISSION', page: 1, limit: 10 };
    expect(await call('county:finance-fee-rules', rules)).toEqual({ total: 2 });
    expect(county.listFeeRules).toHaveBeenCalledWith(rules);
  });

  it('refuses arguments on the no-argument channels', () => {
    const { call } = setup();
    expect(() => call('county:finance-dashboard', 'x')).toThrow(IPCError);
    expect(() => call('county:finance-schools', {})).toThrow(IPCError);
  });

  it('refuses a page larger than 50, an unknown key, a bad ownership and a non-object', () => {
    const { call } = setup();
    expect(() => call('county:finance-payments', { page: 1, limit: 51 })).toThrow(IPCError);
    expect(() => call('county:finance-payments', { page: 1, limit: 50, status: 'x' })).toThrow(IPCError);
    expect(() => call('county:finance-payments', { page: 1, limit: 50, ownership: 'X' })).toThrow(IPCError);
    expect(() => call('county:finance-payments', 'query')).toThrow(IPCError);
    expect(() => call('county:finance-fee-rules', { page: 1, limit: 10, districtId: 'd-1' })).toThrow(IPCError);
    expect(() => call('county:finance-fee-rules', { page: 0, limit: 10 })).toThrow(IPCError);
    expect(() => call('county:finance-fee-rules', { page: 1, limit: 10, ownership: 'X' })).toThrow(IPCError);
  });
});
