import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { DeoStudentsResult, IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoStudentHandlers } from './students';

describe('deo students IPC handlers', () => {
  it('deo:list-students returns the use case data and rejects arguments', async () => {
    const calls = new Map<string, { validate: IpcValidator; handler: () => unknown }>();
    const handle = ((channel: IpcChannel, validate: IpcValidator, handler: () => unknown) => {
      calls.set(channel, { validate, handler });
    }) as IpcHandle;
    const result: DeoStudentsResult = {
      districtId: 'd-1',
      district: null,
      county: null,
      summary: { totalEnrollment: 0, male: 0, female: 0, avgAttendance: null },
      enrollmentTrend: [],
      genderDistribution: { male: 0, female: 0 },
      schools: [],
      dropoutAlerts: [],
    };
    registerDeoStudentHandlers(handle, { deo: { listStudents: async () => ({ data: result }) } } as unknown as ApplicationLayer);
    const call = calls.get('deo:list-students');
    expect(call).toBeDefined();
    expect(await call!.handler()).toEqual(result);
    expect(() => call!.validate([])).not.toThrow();
    expect(() => call!.validate(['d-2'])).toThrow(IPCError);
  });
});
