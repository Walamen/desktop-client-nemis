import { describe, expect, it, vi } from 'vitest';
import type { DeoApplicationService } from '@nemis-desktop/application';
import { DeoReportsViewModel } from './deo-reports-view-model';

const ok = <T>(data: T) => Promise.resolve({ data });

function fakeDeo() {
  return {
    getReportScope: vi.fn(() => ok({ districtId: 'd-1', district: null, county: null, schools: [] })),
    getEnrollmentReport: vi.fn(() => ok({ reportType: 'ENROLLMENT' })),
    getAttendanceReport: vi.fn(() => ok({ reportType: 'ATTENDANCE' })),
    getAcademicReport: vi.fn(() => ok({ reportType: 'ACADEMIC' })),
    getStaffComplianceReport: vi.fn(() => ok({ reportType: 'STAFF_COMPLIANCE' })),
  };
}

describe('DeoReportsViewModel', () => {
  it('loads the scope and each report with its own query', async () => {
    const deo = fakeDeo();
    const vm = new DeoReportsViewModel({ deo: deo as unknown as DeoApplicationService });
    await vm.loadScope();
    expect(vm.store.getState().scope.status).toBe('success');
    await vm.loadReport('ENROLLMENT', { schoolId: 's-1' }, 'WEEKLY');
    expect(deo.getEnrollmentReport).toHaveBeenCalledWith({ schoolId: 's-1' });
    expect(vm.store.getState().enrollment.status).toBe('success');
    await vm.loadReport('ATTENDANCE', {}, 'MONTHLY');
    expect(deo.getAttendanceReport).toHaveBeenCalledWith({ period: 'MONTHLY' });
    await vm.loadReport('ACADEMIC', {}, 'WEEKLY');
    await vm.loadReport('STAFF_COMPLIANCE', {}, 'WEEKLY');
    expect(vm.store.getState().academic.status).toBe('success');
    expect(vm.store.getState().staff.status).toBe('success');
  });

  it('moves a report to error when the service fails', async () => {
    const deo = fakeDeo();
    deo.getAcademicReport.mockImplementation(() => Promise.reject(new Error('database locked')));
    const vm = new DeoReportsViewModel({ deo: deo as unknown as DeoApplicationService });
    await vm.loadReport('ACADEMIC', {}, 'WEEKLY');
    expect(vm.store.getState().academic.status).toBe('error');
  });
});
