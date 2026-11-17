import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../testing/fixed-clock';
import { RecordingLogger } from '../../testing/recording-logger';
import { InMemoryDistrictOverviewReadModel } from '../../testing/deo/in-memory-district-overview';
import { InMemoryCountyAnalyticsReadModel } from '../../testing/county/in-memory-county-analytics-read-model';
import { InMemoryCountyReportsReadModel } from '../../testing/county/in-memory-county-reports-read-model';
import {
  GetCountyAcademicReportUseCase,
  GetCountyAttendanceReportUseCase,
  GetCountyEnrollmentReportUseCase,
  GetCountyStaffComplianceReportUseCase,
} from '../county/get-county-reports';
import { DeoReportUseCase, GetDeoReportScopeUseCase } from './deo-reports';

const NOW = '2026-11-17T12:00:00.000Z';

function world(districtId: string | null = 'd-1') {
  const overview = new InMemoryDistrictOverviewReadModel();
  overview.district = { id: 'd-1', name: 'Buchanan', countyId: 'c-1' };
  overview.county = { id: 'c-1', name: 'Grand Bassa' };
  const reports = new InMemoryCountyReportsReadModel();
  reports.options = { countyCode: 'GB', districts: [{ id: 'd-1', name: 'Buchanan' }] };
  reports.schoolsByDistrict.set('d-1', [
    { id: 's-1', name: 'Alpha' },
    { id: 's-2', name: 'Beta' },
  ]);
  reports.enrollment = { ...reports.enrollment, scopeName: 'Buchanan' };
  const logger = new RecordingLogger();
  const reportDeps = {
    readModel: reports,
    countyReadModel: new InMemoryCountyAnalyticsReadModel(),
    clock: new FixedClock(NOW),
    logger,
  };
  const wrap = <Q extends { schoolId?: string }, R>(
    name: string,
      inner: { execute(query: Q & { districtId: string; districtOnly: true }): Promise<{ data: R }> },
  ) => new DeoReportUseCase<Q, R>({ name, reports, inner: inner as never, currentDistrictId: districtId, logger });
  return {
    overview,
    reports,
    scope: new GetDeoReportScopeUseCase({ districtOverview: overview, reports, currentDistrictId: districtId, logger }),
    enrollment: wrap('GetDeoEnrollmentReport', new GetCountyEnrollmentReportUseCase(reportDeps)),
    attendance: wrap('GetDeoAttendanceReport', new GetCountyAttendanceReportUseCase(reportDeps)),
    academic: wrap('GetDeoAcademicReport', new GetCountyAcademicReportUseCase(reportDeps)),
    staff: wrap('GetDeoStaffReport', new GetCountyStaffComplianceReportUseCase(reportDeps)),
  };
}

describe('GetDeoReportScopeUseCase', () => {
  it('names the district and county with its code, and lists the district schools', async () => {
    const { data } = await world().scope.execute({});
    expect(data).toEqual({
      districtId: 'd-1',
      district: { id: 'd-1', name: 'Buchanan' },
      county: { id: 'c-1', name: 'Grand Bassa', code: 'GB' },
      schools: [
        { id: 's-1', name: 'Alpha' },
        { id: 's-2', name: 'Beta' },
      ],
    });
  });

  it('reads nothing when no district is assigned', async () => {
    const w = world(null);
    const { data } = await w.scope.execute({});
    expect(data).toEqual({ districtId: null, district: null, county: null, schools: [] });
    expect(w.overview.calls).toEqual([]);
  });
});

describe('DeoReportUseCase', () => {
  it('always scopes a report to the session district, with or without a school', async () => {
    const w = world();
    const { data } = await w.enrollment.execute({});
    expect(w.reports.lastEnrollmentQuery).toEqual({ districtId: 'd-1', districtOnly: true });
    expect(data).toMatchObject({ reportType: 'ENROLLMENT', district: { id: 'd-1', name: 'Buchanan' }, generatedAt: NOW });
    await w.academic.execute({ schoolId: 's-2' });
    expect(w.reports.lastAcademicQuery).toEqual({ districtId: 'd-1', schoolId: 's-2', districtOnly: true });
    expect(w.reports.lastListSchoolsOptions).toEqual({ districtOnly: true });
    await w.staff.execute({});
    expect(w.reports.lastStaffQuery).toEqual({ districtId: 'd-1', districtOnly: true });
  });

  it('passes the attendance period through', async () => {
    const w = world();
    await w.attendance.execute({ period: 'MONTHLY' } as never);
    expect(w.reports.lastAttendanceQuery).toMatchObject({ districtId: 'd-1', period: 'MONTHLY' });
  });

  it('refuses a school outside the district, and any report without a district', async () => {
    const w = world();
    await expect(w.enrollment.execute({ schoolId: 's-elsewhere' })).rejects.toThrow('not in your district');
    expect(w.reports.lastEnrollmentQuery).toBeNull();
    await expect(world(null).enrollment.execute({})).rejects.toThrow('No district');
  });
});
