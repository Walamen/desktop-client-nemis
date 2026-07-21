import type {
  AcademicYearResult,
  CurrentUserResult,
  DashboardOverviewResult,
  DeviceInfoResult,
  SchoolSummaryResult,
} from './dashboard';

/**
 * Single source of truth for every IPC endpoint's request/response types.
 * Add an endpoint by adding an entry here first — the main-process
 * registrar and the preload bridge are both keyed off this map.
 * Channel naming convention: `domain:action`.
 */
export interface IpcContract {
  'system:get-version': { args: []; result: string };
  'settings:get': { args: [key: string]; result: unknown };
  'dashboard:get-overview': { args: []; result: DashboardOverviewResult };
  'school:get-summary': { args: []; result: SchoolSummaryResult | null };
  'academic-year:get-current': { args: []; result: AcademicYearResult | null };
  'identity:get-current-user': { args: []; result: CurrentUserResult | null };
  'device:get-info': { args: []; result: DeviceInfoResult | null };
}

export type IpcChannel = keyof IpcContract;

export const IpcChannels = {
  SYSTEM_GET_VERSION: 'system:get-version',
  SETTINGS_GET: 'settings:get',
  DASHBOARD_GET_OVERVIEW: 'dashboard:get-overview',
  SCHOOL_GET_SUMMARY: 'school:get-summary',
  ACADEMIC_YEAR_GET_CURRENT: 'academic-year:get-current',
  IDENTITY_GET_CURRENT_USER: 'identity:get-current-user',
  DEVICE_GET_INFO: 'device:get-info',
} as const satisfies Record<string, IpcChannel>;

// Compile-time exhaustiveness: adding a channel to IpcContract without
// listing it in IpcChannels makes this constant a type error.
type RegisteredChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
export const IPC_CHANNELS_EXHAUSTIVE: Exclude<IpcChannel, RegisteredChannel> extends never
  ? true
  : never = true;

/** Closed contract of renderer-visible error codes — the mapper in the main
 * process (electron/ipc/errorMapping.ts) is the single producer. */
export type IpcErrorCode =
  | 'VALIDATION_FAILED'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'DATABASE_UNAVAILABLE'
  | 'MIGRATION_REQUIRED'
  | 'IPC_ERROR'
  | 'UNEXPECTED_ERROR';

export interface IpcValidationIssue {
  field: string;
  message: string;
}

export interface IpcErrorPayload {
  code: IpcErrorCode;
  message: string;
  /** Present only for VALIDATION_FAILED — our own validator strings, safe to render. */
  issues?: IpcValidationIssue[];
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorPayload };
