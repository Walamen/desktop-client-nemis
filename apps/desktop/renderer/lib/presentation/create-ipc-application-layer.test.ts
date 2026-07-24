import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseUnavailableError } from '@nemis-desktop/presentation';
import { createIpcApplicationLayer } from './create-ipc-application-layer';

function fakeNemis(overrides: Record<string, unknown> = {}) {
  return {
    system: { getVersion: vi.fn(async () => '1.0.0') },
    settings: { get: vi.fn(async () => null) },
    dashboard: {
      getOverview: vi.fn(async () => ({ totalStudents: 5, totalClasses: 2, totalSubjects: 0, attendanceToday: { present: 1, total: 5 }, studentsByGrade: [], recentlyEnrolled: [] })),
    },
    school: { getSummary: vi.fn(async () => null) },
    academicYear: { getCurrent: vi.fn(async () => null) },
    identity: { getCurrentUser: vi.fn(async () => ({ id: 'u1', fullName: 'Local Admin', email: 'a@b', isActive: true, roles: [] })) },
    device: { getInfo: vi.fn(async () => null) },
    ...overrides,
  };
}

describe('createIpcApplicationLayer', () => {
  beforeEach(() => {
    (window as unknown as { nemis: unknown }).nemis = fakeNemis();
  });
  afterEach(() => {
    delete (window as unknown as { nemis?: unknown }).nemis;
  });

  it('reporting.getDashboardOverview returns the bridged data as an ApplicationResponse', async () => {
    const app = createIpcApplicationLayer();
    const res = await app.reporting.getDashboardOverview();
    expect(res.data.totalStudents).toBe(5);
  });

  it('identity.getCurrentUser maps null through to a null-data response', async () => {
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      identity: { getCurrentUser: vi.fn(async () => null) },
    });
    const app = createIpcApplicationLayer();
    expect((await app.identity.getCurrentUser()).data).toBeNull();
  });

  it('translates a DATABASE_UNAVAILABLE IPC error into DatabaseUnavailableError', async () => {
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      dashboard: {
        getOverview: vi.fn(async () => {
          throw new Error('[DATABASE_UNAVAILABLE] The local database is currently unavailable.');
        }),
      },
    });
    const app = createIpcApplicationLayer();
    await expect(app.reporting.getDashboardOverview()).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });

  it('an unwired method throws NotImplementedPresentationError', async () => {
    const app = createIpcApplicationLayer();
    await expect(
      (app.attendance as unknown as { getByClassAndDate: () => Promise<unknown> })
        .getByClassAndDate(),
    ).rejects.toThrow(/not available yet/i);
  });
});
