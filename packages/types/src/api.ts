import type {
  AcademicYearResult,
  CurrentUserResult,
  DashboardOverviewResult,
  DeviceInfoResult,
  SchoolSummaryResult,
} from './dashboard';

export interface SystemApi {
  getVersion(): Promise<string>;
}

export interface SettingsApi {
  /** The stored value for the key, or null when it does not exist. */
  get(key: string): Promise<unknown>;
}

export interface DashboardApi {
  getOverview(): Promise<DashboardOverviewResult>;
}
export interface SchoolApi {
  getSummary(): Promise<SchoolSummaryResult | null>;
}
export interface AcademicYearApi {
  getCurrent(): Promise<AcademicYearResult | null>;
}
export interface IdentityApi {
  getCurrentUser(): Promise<CurrentUserResult | null>;
}
export interface DeviceApi {
  getInfo(): Promise<DeviceInfoResult | null>;
}

export interface NemisApi {
  system: SystemApi;
  settings: SettingsApi;
  dashboard: DashboardApi;
  school: SchoolApi;
  academicYear: AcademicYearApi;
  identity: IdentityApi;
  device: DeviceApi;
}
