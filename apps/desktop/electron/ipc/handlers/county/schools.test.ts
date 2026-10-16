import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountySchoolHandlers } from './schools';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

describe('county school reads', () => {
  it('list-schools takes no args; get-school takes one id and passes it through', async () => {
    const calls = new Map<string, Captured>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
      calls.set(channel, { validate, handler: handler as Captured['handler'] });
    }) as IpcHandle;
    const getSchool = vi.fn(async () => ({ data: null }));
    const app = {
      county: { listSchools: async () => ({ data: { schools: [] } }), getSchool },
    } as unknown as ApplicationLayer;
    registerCountySchoolHandlers(handle, app);
    expect(await calls.get('county:list-schools')!.handler()).toEqual({ schools: [] });
    expect(() => calls.get('county:list-schools')!.validate(['x'])).toThrow(IPCError);
    expect(await calls.get('county:get-school')!.handler('s-1')).toBeNull();
    expect(getSchool).toHaveBeenCalledWith('s-1');
    expect(() => calls.get('county:get-school')!.validate([])).toThrow(IPCError);
  });
});
