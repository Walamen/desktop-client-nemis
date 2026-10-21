import {
  IpcChannels,
  type CountyAttendanceReportQuery,
  type CountyEnrollmentReportQuery,
} from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertCountyAttendanceReportQueryArgs,
  assertCountyEnrollmentReportQueryArgs,
  assertNoArgs,
  assertSingleIdArg,
} from '@app/security/validateIpc';

/** County Generate Reports page, read from this device. */
export function registerCountyReportHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.COUNTY_REPORT_OPTIONS, assertNoArgs, async () => (await app.county.getReportOptions()).data);
  handle(IpcChannels.COUNTY_REPORT_SCHOOLS, assertSingleIdArg, async (districtId: string) =>
    (await app.county.listReportSchools(districtId)).data,
  );
  handle(
    IpcChannels.COUNTY_ENROLLMENT_REPORT,
    assertCountyEnrollmentReportQueryArgs,
    async (query: CountyEnrollmentReportQuery) => (await app.county.getEnrollmentReport(query)).data,
  );
  handle(
    IpcChannels.COUNTY_ATTENDANCE_REPORT,
    assertCountyAttendanceReportQueryArgs,
    async (query: CountyAttendanceReportQuery) => (await app.county.getAttendanceReport(query)).data,
  );
  handle(
    IpcChannels.COUNTY_ACADEMIC_REPORT,
    assertCountyEnrollmentReportQueryArgs,
    async (query: CountyEnrollmentReportQuery) => (await app.county.getAcademicReport(query)).data,
  );
  handle(
    IpcChannels.COUNTY_STAFF_REPORT,
    assertCountyEnrollmentReportQueryArgs,
    async (query: CountyEnrollmentReportQuery) => (await app.county.getStaffComplianceReport(query)).data,
  );
}
