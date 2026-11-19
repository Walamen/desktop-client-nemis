import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { DeoSchoolsResult, IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoSchoolHandlers } from './schools';

describe('deo schools IPC handlers', () => {
  it('deo:list-schools returns the use case data and rejects arguments', async () => {
    const calls = new Map<string, { validate: IpcValidator; handler: () => unknown }>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: () => unknown) => {
      calls.set(channel, { validate, handler });
    }) as IpcHandle;
    const result: DeoSchoolsResult = { districtId: 'd-1', district: null, county: null, schools: [] };
    registerDeoSchoolHandlers(handle, { deo: { listSchools: async () => ({ data: result }) } } as unknown as ApplicationLayer);
    const call = calls.get('deo:list-schools');
    expect(call).toBeDefined();
    expect(await call!.handler()).toEqual(result);
    expect(() => call!.validate([])).not.toThrow();
    expect(() => call!.validate(['d-2'])).toThrow(IPCError);
  });

  it('deo:get-school forwards the id and validates a single non-empty string id', async () => {
    const calls = new Map<string, { validate: IpcValidator; handler: (...args: readonly unknown[]) => unknown }>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
      calls.set(channel, { validate, handler: handler as (...args: readonly unknown[]) => unknown });
    }) as IpcHandle;
    const result = { districtId: 'd-1', school: null };
    const getSchool = vi.fn(async () => ({ data: result }));
    registerDeoSchoolHandlers(handle, { deo: { listSchools: async () => ({ data: null }), getSchool } } as unknown as ApplicationLayer);
    const call = calls.get('deo:get-school');
    expect(call).toBeDefined();
    expect(await call!.handler('s-1')).toEqual(result);
    expect(getSchool).toHaveBeenCalledWith('s-1');
    expect(() => call!.validate(['s-1'])).not.toThrow();
    expect(() => call!.validate([])).toThrow(IPCError);
    expect(() => call!.validate([''])).toThrow(IPCError);
    expect(() => call!.validate([42])).toThrow(IPCError);
  });
});
