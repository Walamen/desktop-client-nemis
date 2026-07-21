import type {
  AcademicYearResult,
  CurrentUserResult,
  DashboardOverviewResult,
  DeviceInfoResult,
  SchoolSummaryResult,
} from '@nemis-desktop/types';

function api() {
  if (typeof window === 'undefined' || !window.nemis) {
    throw new Error('Desktop bridge unavailable (running outside Electron).');
  }
  return window.nemis;
}

/** The single renderer-side caller of the dashboard/bootstrap IPC channels.
 * Lives in services/ (the only place allowed to touch window.nemis). Returns
 * raw wire results; error translation happens in the ApplicationLayer facade. */
export const nemisBridge = {
  getDashboardOverview: (): Promise<DashboardOverviewResult> => api().dashboard.getOverview(),
  getSchoolSummary: (): Promise<SchoolSummaryResult | null> => api().school.getSummary(),
  getCurrentAcademicYear: (): Promise<AcademicYearResult | null> => api().academicYear.getCurrent(),
  getCurrentUser: (): Promise<CurrentUserResult | null> => api().identity.getCurrentUser(),
  getDeviceInfo: (): Promise<DeviceInfoResult | null> => api().device.getInfo(),
};
