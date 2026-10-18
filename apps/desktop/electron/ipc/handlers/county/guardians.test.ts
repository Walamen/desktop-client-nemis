import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyGuardianHandlers } from './guardians';

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
    listGuardians: vi.fn(async () => ({ data: { total: 0 } })),
    getGuardian: vi.fn(async () => ({ data: null })),
  };
  registerCountyGuardianHandlers(handle, { county } as unknown as ApplicationLayer);
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { calls, county, call };
}

describe('county guardians channels', () => {
  it('list and detail forward to the County application service', async () => {
    const { county, call } = setup();
    const query = { search: 'ada', relationship: 'Father', page: 2, limit: 12 };
    expect(await call('county:list-guardians', query)).toEqual({ total: 0 });
    expect(county.listGuardians).toHaveBeenCalledWith(query);
    expect(await call('county:get-guardian', 'g-1')).toBeNull();
    expect(county.getGuardian).toHaveBeenCalledWith('g-1');
  });

  it('validators refuse malformed requests', () => {
    const { calls } = setup();
    const validate = (channel: string, ...args: unknown[]) => () => calls.get(channel)!.validate(args);
    expect(validate('county:list-guardians', { page: 1, limit: 51 })).toThrow(IPCError);
    expect(validate('county:list-guardians', { page: 1, limit: 12, extra: 1 })).toThrow(IPCError);
    expect(validate('county:list-guardians', { page: 0.5, limit: 12 })).toThrow(IPCError);
    expect(validate('county:list-guardians', { page: 1, limit: 12, relationship: 7 })).toThrow(IPCError);
    expect(validate('county:get-guardian', 7)).toThrow(IPCError);
    expect(
      validate('county:list-guardians', { page: 1, limit: 12, relationship: 'Father', districtId: 'd-1', search: 'ada' }),
    ).not.toThrow();
  });
});
