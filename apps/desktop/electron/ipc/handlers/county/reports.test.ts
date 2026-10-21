import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerCountyReportHandlers } from './reports';

interface Captured {
  validate: IpcValidator;
  handler: (...args: readonly unknown[]) => unknown;
}

function setup() {
  const calls = new Map<string, Captured>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: unknown) => {
    calls.set(channel, { validate, handler: handler as Captured['handler'] });
  }) as IpcHandle;
  const county = {
    getReportOptions: vi.fn(async () => ({ data: { districts: [] } })),
    listReportSchools: vi.fn(async () => ({ data: [{ id: 's-1', name: 'Alpha' }] })),
    getEnrollmentReport: vi.fn(async () => ({ data: { reportType: 'ENROLLMENT' } })),
    getAttendanceReport: vi.fn(async () => ({ data: { reportType: 'ATTENDANCE' } })),
    getAcademicReport: vi.fn(async () => ({ data: { reportType: 'ACADEMIC' } })),
    getStaffComplianceReport: vi.fn(async () => ({ data: { reportType: 'STAFF_COMPLIANCE' } })),
  };
  registerCountyReportHandlers(handle, { county } as unknown as ApplicationLayer);
  const call = (channel: string, ...args: unknown[]) => {
    const captured = calls.get(channel)!;
    captured.validate(args);
    return captured.handler(...args);
  };
  return { county, call };
}

describe('county reports channels', () => {
  it('each channel forwards to the County application service and returns its data', async () => {
    const { county, call } = setup();
    expect(await call('county:report-options')).toEqual({ districts: [] });
    expect(await call('county:report-schools', 'd-1')).toEqual([{ id: 's-1', name: 'Alpha' }]);
    expect(county.listReportSchools).toHaveBeenCalledWith('d-1');
    const query = { districtId: 'd-1', schoolId: 's-1' };
    expect(await call('county:enrollment-report', query)).toEqual({ reportType: 'ENROLLMENT' });
    expect(county.getEnrollmentReport).toHaveBeenCalledWith(query);
    expect(await call('county:enrollment-report', {})).toEqual({ reportType: 'ENROLLMENT' });
  });

  it('attendance, academic and staff channels forward and return .data', async () => {
    const { county, call } = setup();
    const attendance = { districtId: 'd-1', period: 'MONTHLY' };
    expect(await call('county:attendance-report', attendance)).toEqual({ reportType: 'ATTENDANCE' });
    expect(county.getAttendanceReport).toHaveBeenCalledWith(attendance);
    expect(await call('county:academic-report', { schoolId: 's-1' })).toEqual({ reportType: 'ACADEMIC' });
    expect(county.getAcademicReport).toHaveBeenCalledWith({ schoolId: 's-1' });
    expect(await call('county:staff-report', {})).toEqual({ reportType: 'STAFF_COMPLIANCE' });
    expect(county.getStaffComplianceReport).toHaveBeenCalledWith({});
  });

  it('attendance refuses an unknown period; academic and staff refuse a period', () => {
    const { call } = setup();
    expect(() => call('county:attendance-report', { period: 'YEARLY' })).toThrow(IPCError);
    expect(() => call('county:academic-report', { period: 'DAILY' })).toThrow(IPCError);
    expect(() => call('county:staff-report', 'x')).toThrow(IPCError);
  });

  it('refuses bad arguments', () => {
    const { call } = setup();
    expect(() => call('county:report-options', 'x')).toThrow(IPCError);
    expect(() => call('county:report-schools')).toThrow(IPCError);
    expect(() => call('county:enrollment-report', { districtId: 'd-1', period: 'DAILY' })).toThrow(IPCError);
    expect(() => call('county:enrollment-report', 'query')).toThrow(IPCError);
    expect(() => call('county:enrollment-report', { schoolId: 7 })).toThrow(IPCError);
  });
});
