import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyDashboardHandlers } from './dashboard';

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

const dashboard = {
  county: { id: 'county-1', name: 'Grand Bassa' },
  districts: [],
  stats: { totalSchools: 1, totalStudents: 2, totalTeachers: 3 },
  chartData: {
    enrollmentByDistrict: [],
    enrollmentTrend: [],
    genderDistribution: { male: 1, female: 1 },
    attendanceCompliance: [],
    dropoutTrend: [],
  },
  byLevel: {},
};

describe('county IPC handlers', () => {
  it('county:get-dashboard returns the use case data and rejects extra args', async () => {
    const { calls, handle } = makeHarness();
    const app = { county: { getDashboard: async () => ({ data: dashboard }) } } as unknown as ApplicationLayer;
    registerCountyDashboardHandlers(handle, app);
    const call = calls.get('county:get-dashboard');
    expect(call).toBeDefined();
    expect(await call!.handler()).toEqual(dashboard);
    expect(() => call!.validate(['unexpected'])).toThrow(IPCError);
  });
});
