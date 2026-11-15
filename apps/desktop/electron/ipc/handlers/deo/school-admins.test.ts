import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { DeoSchoolAdminsResult, IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoSchoolAdminHandlers } from './school-admins';

describe('deo school admins IPC handlers', () => {
  it('deo:list-school-admins returns the use case data and rejects arguments', async () => {
    const calls = new Map<string, { validate: IpcValidator; handler: () => unknown }>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: () => unknown) => {
      calls.set(channel, { validate, handler });
    }) as IpcHandle;
    const result: DeoSchoolAdminsResult = {
      districtId: 'd-1',
      district: null,
      county: null,
      admins: [],
      schoolsWithoutAdmin: [],
    };
    registerDeoSchoolAdminHandlers(handle, {
      deo: { listSchoolAdmins: async () => ({ data: result }) },
    } as unknown as ApplicationLayer);
    const call = calls.get('deo:list-school-admins');
    expect(call).toBeDefined();
    expect(await call!.handler()).toEqual(result);
    expect(() => call!.validate([])).not.toThrow();
    expect(() => call!.validate(['d-2'])).toThrow(IPCError);
  });
});
