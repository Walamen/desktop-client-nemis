import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { DeoTeachersResult, IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoTeacherHandlers } from './teachers';

describe('deo teachers IPC handlers', () => {
  it('deo:list-teachers returns the use case data and rejects arguments', async () => {
    const calls = new Map<string, { validate: IpcValidator; handler: () => unknown }>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: () => unknown) => {
      calls.set(channel, { validate, handler });
    }) as IpcHandle;
    const result: DeoTeachersResult = {
      districtId: 'd-1',
      district: null,
      county: null,
      teachers: [],
      summary: { totalTeachers: 0, gradesPending: 0, pendingApproval: 0, unassigned: 0 },
    };
    registerDeoTeacherHandlers(handle, { deo: { listTeachers: async () => ({ data: result }) } } as unknown as ApplicationLayer);
    const call = calls.get('deo:list-teachers');
    expect(call).toBeDefined();
    expect(await call!.handler()).toEqual(result);
    expect(() => call!.validate([])).not.toThrow();
    expect(() => call!.validate(['d-2'])).toThrow(IPCError);
  });
});
