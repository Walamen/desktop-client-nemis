import type {
  AcademicYearListItemResult,
  ClassListRequest,
  ClassResult,
  ClassSubjectPairRequest,
  ClassSubjectResult,
  CreateAcademicYearRequest,
  CreateClassRequest,
  CreateSubjectRequest,
  CreateTermRequest,
  DeletedResult,
  GradeLevelCountResult,
  PagedListResult,
  SetAcademicYearStatusRequest,
  SetActiveRequest,
  SubjectListRequest,
  SubjectResult,
  TermResult,
  UpdateAcademicYearRequest,
  UpdateClassRequest,
  UpdateSubjectRequest,
  UpdateTermRequest,
} from './academics';
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
  list(): Promise<AcademicYearListItemResult[]>;
  create(request: CreateAcademicYearRequest): Promise<AcademicYearListItemResult>;
  update(request: UpdateAcademicYearRequest): Promise<AcademicYearListItemResult>;
  setCurrent(id: string): Promise<AcademicYearListItemResult>;
  setStatus(request: SetAcademicYearStatusRequest): Promise<AcademicYearListItemResult>;
}
export interface TermApi {
  list(academicYearId: string): Promise<TermResult[]>;
  getCurrent(): Promise<TermResult | null>;
  create(request: CreateTermRequest): Promise<TermResult>;
  update(request: UpdateTermRequest): Promise<TermResult>;
  setCurrent(id: string): Promise<TermResult>;
  delete(id: string): Promise<DeletedResult>;
}
export interface ClassesApi {
  list(request: ClassListRequest): Promise<PagedListResult<ClassResult>>;
  create(request: CreateClassRequest): Promise<ClassResult>;
  update(request: UpdateClassRequest): Promise<ClassResult>;
  setActive(request: SetActiveRequest): Promise<ClassResult>;
  gradeLevelCounts(): Promise<GradeLevelCountResult[]>;
  listSubjects(classId: string): Promise<ClassSubjectResult[]>;
  assignSubject(request: ClassSubjectPairRequest): Promise<ClassSubjectResult>;
  unassignSubject(request: ClassSubjectPairRequest): Promise<DeletedResult>;
}
export interface SubjectApi {
  list(request: SubjectListRequest): Promise<PagedListResult<SubjectResult>>;
  create(request: CreateSubjectRequest): Promise<SubjectResult>;
  update(request: UpdateSubjectRequest): Promise<SubjectResult>;
  setActive(request: SetActiveRequest): Promise<SubjectResult>;
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
  term: TermApi;
  classes: ClassesApi;
  subject: SubjectApi;
  identity: IdentityApi;
  device: DeviceApi;
}
