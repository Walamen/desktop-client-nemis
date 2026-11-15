import { describe, expect, it } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { DeoDashboardResult, IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoDashboardHandlers } from './dashboard';

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

const dashboard: DeoDashboardResult = {
  districtId: 'd-1',
  district: { id: 'd-1', name: 'Buchanan' },
  county: { id: 'county-1', name: 'Grand Bassa' },
  stats: { totalSchools: 1, totalStudents: 2, totalTeachers: 3, feeCompliance: 60 },
  alerts: [],
  alertSummary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
  schools: [],
  chartData: { enrollmentTrend: [], attendanceTrend: [], genderDistribution: { male: 1, female: 1 } },
  submissions: [],
};

describe('deo IPC handlers', () => {
  it('deo:get-dashboard returns the use case data and rejects extra args', async () => {
    const { calls, handle } = makeHarness();
    const app = { deo: { getDashboard: async () => ({ data: dashboard }) } } as unknown as ApplicationLayer;
    registerDeoDashboardHandlers(handle, app);
    const call = calls.get('deo:get-dashboard');
    expect(call).toBeDefined();
    expect(await call!.handler()).toEqual(dashboard);
    expect(() => call!.validate([])).not.toThrow();
    expect(() => call!.validate(['unexpected'])).toThrow(IPCError);
  });

  it('deo:resolve-alert passes one alert id through and returns the outcome', async () => {
    const { calls, handle } = makeHarness();
    const seen: string[] = [];
    const app = {
      deo: {
        resolveAlert: async (alertId: string) => {
          seen.push(alertId);
          return { data: true };
        },
      },
    } as unknown as ApplicationLayer;
    registerDeoDashboardHandlers(handle, app);
    const call = calls.get('deo:resolve-alert');
    expect(call).toBeDefined();
    expect(await call!.handler('a-1')).toBe(true);
    expect(seen).toEqual(['a-1']);
  });

  it('deo:resolve-alert accepts exactly one string id', () => {
    const { calls, handle } = makeHarness();
    registerDeoDashboardHandlers(handle, { deo: {} } as unknown as ApplicationLayer);
    const { validate } = calls.get('deo:resolve-alert')!;
    expect(() => validate(['a-1'])).not.toThrow();
    expect(() => validate([])).toThrow(IPCError);
    expect(() => validate(['a-1', 'a-2'])).toThrow(IPCError);
    expect(() => validate([42])).toThrow(IPCError);
    expect(() => validate(['x'.repeat(5000)])).toThrow(IPCError);
  });
});
