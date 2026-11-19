import { IpcChannels, type DeoAttendanceReportQuery, type DeoReportQuery } from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertDeoAttendanceReportQueryArgs,
  assertDeoReportQueryArgs,
  assertNoArgs,
} from '@app/security/validateIpc';

/** DEO Generate Reports, from this device. The district comes from the
 * signed-in workspace, never from the renderer: the queries accept only a
 * school (and the attendance period). */
export function registerDeoReportHandlers(handle: IpcHandle, app: ApplicationLayer): void {
  handle(IpcChannels.DEO_REPORT_SCOPE, assertNoArgs, async () => (await app.deo.getReportScope()).data);
  handle(IpcChannels.DEO_ENROLLMENT_REPORT, assertDeoReportQueryArgs, async (query: DeoReportQuery) =>
    (await app.deo.getEnrollmentReport(query)).data,
  );
  handle(IpcChannels.DEO_ATTENDANCE_REPORT, assertDeoAttendanceReportQueryArgs, async (query: DeoAttendanceReportQuery) =>
    (await app.deo.getAttendanceReport(query)).data,
  );
  handle(IpcChannels.DEO_ACADEMIC_REPORT, assertDeoReportQueryArgs, async (query: DeoReportQuery) =>
    (await app.deo.getAcademicReport(query)).data,
  );
  handle(IpcChannels.DEO_STAFF_REPORT, assertDeoReportQueryArgs, async (query: DeoReportQuery) =>
    (await app.deo.getStaffComplianceReport(query)).data,
  );
  handle(IpcChannels.DEO_REPORTS_COMPLIANCE, assertNoArgs, async () => (await app.deo.getReportsCompliance()).data);
}
