import { describe, expect, it } from 'vitest';
import { RecordingLogger } from '../../testing/recording-logger';
import { FixedClock } from '../../testing/fixed-clock';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyReportsReadModel } from '../../testing/county/in-memory-county-reports-read-model';
import {
  GetCountyAcademicReportUseCase,
  GetCountyAttendanceReportUseCase,
  GetCountyStaffComplianceReportUseCase,
  GetCountyEnrollmentReportUseCase,
  GetCountyReportOptionsUseCase,
  GetCountyReportSchoolsUseCase,
} from './get-county-reports';

const NOW = '2026-10-20T12:00:00.000Z';

function deps() {
  const readModel = new InMemoryCountyReportsReadModel();
  const countyReadModel = new InMemoryCountyAnalyticsReadModel();
  countyReadModel.county = { id: 'county-1', name: 'Grand Bassa' };
  return { readModel, countyReadModel, clock: new FixedClock(NOW), logger: new RecordingLogger() };
}

describe('GetCountyReportOptionsUseCase', () => {
  it('options carry the county with its code', async () => {
    const d = deps();
    d.readModel.options = { countyCode: 'GB', districts: [{ id: 'd-1', name: 'Buchanan' }] };
    const { data } = await new GetCountyReportOptionsUseCase(d).execute({});
    expect(data).toEqual({
      county: { id: 'county-1', name: 'Grand Bassa', code: 'GB' },
      districts: [{ id: 'd-1', name: 'Buchanan' }],
    });
  });

  it('options have no county when none is synced', async () => {
    const d = deps();
    d.countyReadModel.county = null;
    const { data } = await new GetCountyReportOptionsUseCase(d).execute({});
    expect(data!.county).toBeNull();
  });
});

describe('GetCountyEnrollmentReportUseCase', () => {
  it('enrollment report is stamped with the clock and names the county when county-wide', async () => {
    const d = deps();
    const { data } = await new GetCountyEnrollmentReportUseCase(d).execute({});
    expect(d.readModel.lastNowIso).toBe(NOW);
    expect(data!.generatedAt).toBe(NOW);
    expect(data!.district).toEqual({ id: 'county-1', name: 'Grand Bassa' });
    expect(data).not.toHaveProperty('scopeName');
  });

  it('enrollment report names the district when one is chosen', async () => {
    const d = deps();
    d.readModel.enrollment = { ...d.readModel.enrollment, scopeName: 'Buchanan' };
    const { data } = await new GetCountyEnrollmentReportUseCase(d).execute({ districtId: 'd-1', schoolId: 's-1' });
    expect(d.readModel.lastEnrollmentQuery).toEqual({ districtId: 'd-1', schoolId: 's-1' });
    expect(data!.district).toEqual({ id: 'd-1', name: 'Buchanan' });
  });
});

describe('GetCountyAttendanceReportUseCase', () => {
  it('attendance defaults the period to WEEKLY and is stamped by the clock', async () => {
    const d = deps();
    const { data } = await new GetCountyAttendanceReportUseCase(d).execute({ districtId: 'd-1' });
    expect(d.readModel.lastAttendanceQuery).toEqual({ districtId: 'd-1', period: 'WEEKLY' });
    expect(d.readModel.lastNowIso).toBe(NOW);
    expect(data!.generatedAt).toBe(NOW);
    expect(data).not.toHaveProperty('scopeName');
  });

  it('attendance keeps a chosen period', async () => {
    const d = deps();
    await new GetCountyAttendanceReportUseCase(d).execute({ period: 'MONTHLY' });
    expect(d.readModel.lastAttendanceQuery).toEqual({ period: 'MONTHLY' });
  });
});

describe('GetCountyAcademicReportUseCase and GetCountyStaffComplianceReportUseCase', () => {
  it('academic and staff name the district when one is chosen, the county otherwise', async () => {
    const d = deps();
    d.readModel.academic = { ...d.readModel.academic, scopeName: 'Buchanan' };
    const academic = await new GetCountyAcademicReportUseCase(d).execute({ districtId: 'd-1' });
    expect(d.readModel.lastAcademicQuery).toEqual({ districtId: 'd-1' });
    expect(academic.data!.district).toEqual({ id: 'd-1', name: 'Buchanan' });
    expect(academic.data!.generatedAt).toBe(NOW);
    const staff = await new GetCountyStaffComplianceReportUseCase(d).execute({});
    expect(d.readModel.lastStaffQuery).toEqual({});
    expect(staff.data!.district).toEqual({ id: 'county-1', name: 'Grand Bassa' });
  });
});

describe('GetCountyReportSchoolsUseCase', () => {
  it('schools pass through for the district', async () => {
    const d = deps();
    d.readModel.schoolsByDistrict.set('d-1', [{ id: 's-1', name: 'Alpha' }]);
    const { data } = await new GetCountyReportSchoolsUseCase(d).execute({ districtId: 'd-1' });
    expect(data).toEqual([{ id: 's-1', name: 'Alpha' }]);
  });
});
