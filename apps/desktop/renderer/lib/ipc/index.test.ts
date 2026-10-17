import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseUnavailableError } from '@nemis-desktop/presentation';
import { createIpcApplicationLayer } from './index';

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

  it('county.getDashboard returns the bridged data as an ApplicationResponse', async () => {
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      county: { getDashboard: vi.fn(async () => ({ county: { id: 'county-1', name: 'Grand Bassa' } })) },
    });
    const app = createIpcApplicationLayer();
    const res = await app.county.getDashboard();
    expect(res.data.county).toEqual({ id: 'county-1', name: 'Grand Bassa' });
  });

  it('county.listDistricts and county.getDistrict return bridged data', async () => {
    const getDistrict = vi.fn(async () => null);
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      county: { listDistricts: vi.fn(async () => ({ districts: [] })), getDistrict },
    });
    const app = createIpcApplicationLayer();
    expect((await app.county.listDistricts()).data).toEqual({ districts: [] });
    expect((await app.county.getDistrict('d-1')).data).toBeNull();
    expect(getDistrict).toHaveBeenCalledWith('d-1');
  });

  it('county.listSchools and county.getSchool return bridged data', async () => {
    const getSchool = vi.fn(async () => null);
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      county: { listSchools: vi.fn(async () => ({ schools: [] })), getSchool },
    });
    const app = createIpcApplicationLayer();
    expect((await app.county.listSchools()).data).toEqual({ schools: [] });
    expect((await app.county.getSchool('s-1')).data).toBeNull();
    expect(getSchool).toHaveBeenCalledWith('s-1');
  });

  it('county school registration methods return bridged data', async () => {
    const county = {
      getRegistrationContext: vi.fn(async () => ({ county: null, districts: [] })),
      registerSchools: vi.fn(async () => ({ status: 'saved', ids: ['r-1'] })),
      resubmitSchoolRegistration: vi.fn(async () => ({ status: 'not-found' })),
      discardSchoolRegistration: vi.fn(async () => ({ discarded: true })),
      getSchoolRegistrations: vi.fn(async () => []),
    };
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({ county });
    const app = createIpcApplicationLayer();
    expect((await app.county.getRegistrationContext()).data).toEqual({ county: null, districts: [] });
    const request = { source: 'form' as const, schools: [] };
    expect((await app.county.registerSchools(request)).data).toEqual({ status: 'saved', ids: ['r-1'] });
    expect(county.registerSchools).toHaveBeenCalledWith(request);
    expect((await app.county.resubmitSchoolRegistration({ id: 'r-1', school: {} as never })).data).toEqual({ status: 'not-found' });
    expect((await app.county.discardSchoolRegistration('r-1')).data).toEqual({ discarded: true });
    expect(county.discardSchoolRegistration).toHaveBeenCalledWith('r-1');
    expect((await app.county.getSchoolRegistrations(['r-1'])).data).toEqual([]);
    expect(county.getSchoolRegistrations).toHaveBeenCalledWith(['r-1']);
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

  it('academics.createTerm/updateTerm forward the sequence field to the bridge', async () => {
    const createTerm = vi.fn(async () => ({ id: 't-1' }));
    const updateTerm = vi.fn(async () => ({ id: 't-1' }));
    (window as unknown as { nemis: unknown }).nemis = fakeNemis({
      term: { create: createTerm, update: updateTerm },
    });
    const app = createIpcApplicationLayer();

    await app.academics.createTerm({
      academicYearId: 'ay-1', name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-19',
    });
    expect(createTerm).toHaveBeenCalledWith(expect.objectContaining({ sequence: 1 }));

    await app.academics.updateTerm({ id: 't-1', sequence: 2 });
    expect(updateTerm).toHaveBeenCalledWith(expect.objectContaining({ sequence: 2 }));
  });

  it('an unwired method throws NotImplementedPresentationError', async () => {
    const app = createIpcApplicationLayer();
    await expect(
      (app.assessments as unknown as { createAssessment: () => Promise<unknown> })
        .createAssessment(),
    ).rejects.toThrow(/not available yet/i);
  });
});
