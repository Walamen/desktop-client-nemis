import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyDistrictHandlers } from './districts';
import { registerCountyDeoHandlers } from './deo';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function capture() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

describe('county district reads', () => {
  it('list-districts takes no args; get-district takes one id and passes it through', async () => {
    const { calls, handle } = capture();
    const getDistrict = vi.fn(async () => ({ data: null }));
    const app = {
      county: { listDistricts: async () => ({ data: { districts: [] } }), getDistrict },
    } as unknown as ApplicationLayer;
    registerCountyDistrictHandlers(handle, app);
    expect(await calls.get('county:list-districts')!.handler()).toEqual({ districts: [] });
    expect(() => calls.get('county:list-districts')!.validate(['x'])).toThrow(IPCError);
    expect(await calls.get('county:get-district')!.handler('d-1')).toBeNull();
    expect(getDistrict).toHaveBeenCalledWith('d-1');
    expect(() => calls.get('county:get-district')!.validate([])).toThrow(IPCError);
    expect(() => calls.get('county:get-district')!.validate([5])).toThrow(IPCError);
  });
});

describe('county DEO commands', () => {
  const gateway = () => ({
    assignDistrictOfficer: vi.fn(async () => null),
    removeDistrictOfficer: vi.fn(async () => null),
  });

  it('assign runs the command then the forced pull', async () => {
    const { calls, handle } = capture();
    const g = gateway();
    const refresh = vi.fn(async () => true);
    registerCountyDeoHandlers(handle, g, refresh);
    const request = { districtId: 'd-1', userId: 'deo-1', replaceExisting: false };
    expect(await calls.get('county:assign-deo')!.handler(request)).toEqual({ data: null, refreshed: true });
    expect(g.assignDistrictOfficer).toHaveBeenCalledWith(request);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reports refreshed:false without throwing when the pull fails', async () => {
    const { calls, handle } = capture();
    registerCountyDeoHandlers(handle, gateway(), vi.fn(async () => {
      throw new Error('offline');
    }));
    expect(await calls.get('county:remove-deo')!.handler({ districtId: 'd-1', userId: 'deo-1' })).toEqual({
      data: null,
      refreshed: false,
    });
  });

  it('validates the request shapes', () => {
    const { calls, handle } = capture();
    registerCountyDeoHandlers(handle, gateway(), vi.fn(async () => true));
    const assign = calls.get('county:assign-deo')!;
    expect(() => assign.validate([{ districtId: 'd-1', userId: 'u-1', replaceExisting: true }])).not.toThrow();
    expect(() => assign.validate([{ districtId: 'd-1', userId: 'u-1' }])).toThrow(IPCError);
    expect(() => assign.validate([{ districtId: 'd-1', userId: 'u-1', replaceExisting: 'yes' }])).toThrow(IPCError);
    expect(() => assign.validate([{ districtId: '', userId: 'u-1', replaceExisting: true }])).toThrow(IPCError);
    expect(() => calls.get('county:remove-deo')!.validate([{ districtId: 'd-1', userId: 'u-1', extra: 1 }])).toThrow(IPCError);
  });
});
