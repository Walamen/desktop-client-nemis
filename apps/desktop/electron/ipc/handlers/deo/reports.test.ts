import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcChannel } from '@nemis-desktop/types';
import { IPCError } from '@nemis-desktop/shared';
import type { IpcHandle, IpcValidator } from '@app/ipc/registrar';
import { registerDeoReportHandlers } from './reports';

function register() {
  const calls = new Map<string, { validate: IpcValidator; handler: (...args: unknown[]) => unknown }>();
  const handle = ((channel: IpcChannel, validate: IpcValidator, handler: (...args: unknown[]) => unknown) => {
    calls.set(channel, { validate, handler });
  }) as IpcHandle;
  const deo = {
    getReportScope: vi.fn(async () => ({ data: { districtId: 'd-1' } })),
    getEnrollmentReport: vi.fn(async () => ({ data: { reportType: 'ENROLLMENT' } })),
    getAttendanceReport: vi.fn(async () => ({ data: { reportType: 'ATTENDANCE' } })),
    getAcademicReport: vi.fn(async () => ({ data: { reportType: 'ACADEMIC' } })),
    getStaffComplianceReport: vi.fn(async () => ({ data: { reportType: 'STAFF_COMPLIANCE' } })),
  };
  registerDeoReportHandlers(handle, { deo } as unknown as ApplicationLayer);
  return { calls, deo };
}

describe('deo report IPC handlers', () => {
  it('serves the scope without arguments', async () => {
    const { calls } = register();
    const scope = calls.get('deo:report-scope')!;
    expect(await scope.handler()).toEqual({ districtId: 'd-1' });
    expect(() => scope.validate(['d-2'])).toThrow(IPCError);
  });

  it('passes a school filter through to each report', async () => {
    const { calls, deo } = register();
    await calls.get('deo:report-enrollment')!.handler({ schoolId: 's-1' });
    expect(deo.getEnrollmentReport).toHaveBeenCalledWith({ schoolId: 's-1' });
    await calls.get('deo:report-attendance')!.handler({ period: 'MONTHLY' });
    expect(deo.getAttendanceReport).toHaveBeenCalledWith({ period: 'MONTHLY' });
    expect(await calls.get('deo:report-academic')!.handler({})).toEqual({ reportType: 'ACADEMIC' });
    expect(await calls.get('deo:report-staff-compliance')!.handler({})).toEqual({ reportType: 'STAFF_COMPLIANCE' });
  });

  it('never lets the renderer choose the district, and rejects bad filters', () => {
    const { calls } = register();
    for (const channel of ['deo:report-enrollment', 'deo:report-academic', 'deo:report-staff-compliance', 'deo:report-attendance']) {
      const { validate } = calls.get(channel)!;
      expect(() => validate([{}])).not.toThrow();
      expect(() => validate([{ schoolId: 's-1' }])).not.toThrow();
      expect(() => validate([{ districtId: 'd-2' }])).toThrow(IPCError);
      expect(() => validate([{ schoolId: 7 }])).toThrow(IPCError);
      expect(() => validate([])).toThrow(IPCError);
    }
    const attendance = calls.get('deo:report-attendance')!.validate;
    expect(() => attendance([{ period: 'WEEKLY' }])).not.toThrow();
    expect(() => attendance([{ period: 'YEARLY' }])).toThrow(IPCError);
    expect(() => calls.get('deo:report-enrollment')!.validate([{ period: 'WEEKLY' }])).toThrow(IPCError);
  });
});
