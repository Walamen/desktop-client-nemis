import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel, IpcContract } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '../registrar';
import { registerDashboardHandlers } from './dashboard';
import { registerSchoolHandlers } from './school';
import { registerAcademicYearHandlers } from './academicYear';
import { registerIdentityHandlers } from './identity';
import { registerDeviceHandlers } from './device';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function makeHarness() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  return { calls, handle };
}

const app = {
  reporting: { getDashboardOverview: async () => ({ data: { totalStudents: 3, totalClasses: 2, totalSubjects: 1, attendanceToday: { present: 1, total: 3 }, studentsByGrade: [], recentlyEnrolled: [] } }) },
  institution: { getCurrentSchool: async () => ({ data: null }) },
  academics: { getCurrentAcademicYear: async () => ({ data: null }) },
  identity: { getCurrentUser: async () => ({ data: { id: 'u1', fullName: 'Local Admin', email: 'a@b', isActive: true, roles: [] } }) },
  infra: { getDeviceInfo: async () => ({ data: null }) },
} as unknown as ApplicationLayer;

describe('dashboard/bootstrap IPC handlers', () => {
  it('dashboard:get-overview returns the overview data and rejects extra args', async () => {
    const { calls, handle } = makeHarness();
    registerDashboardHandlers(handle, app);
    const call = calls.get('dashboard:get-overview');
    expect(call).toBeDefined();
    const result = (await call!.handler()) as IpcContract['dashboard:get-overview']['result'];
    expect(result.totalStudents).toBe(3);
    expect(() => call!.validate(['unexpected'])).toThrow(IPCError);
  });

  it('registers the other four no-arg channels', () => {
    const { calls, handle } = makeHarness();
    registerSchoolHandlers(handle, app);
    registerAcademicYearHandlers(handle, app);
    registerIdentityHandlers(handle, app);
    registerDeviceHandlers(handle, app);
    for (const channel of ['school:get-summary', 'academic-year:get-current', 'identity:get-current-user', 'device:get-info']) {
      expect(calls.get(channel)).toBeDefined();
    }
  });

  it('identity:get-current-user returns the mapped user', async () => {
    const { calls, handle } = makeHarness();
    registerIdentityHandlers(handle, app);
    const result = await calls.get('identity:get-current-user')!.handler();
    expect(result).toEqual({ id: 'u1', fullName: 'Local Admin', email: 'a@b', isActive: true, roles: [] });
  });
});
