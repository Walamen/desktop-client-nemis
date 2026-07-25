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
import type {
  CreateGuardianRequest,
  CreateStudentRequest,
  EnrollStudentRequest,
  EnrollmentResult,
  MoveEnrollmentClassRequest,
  SetStudentActiveRequest,
  StudentListRequest,
  StudentPageResult,
  StudentResult,
  UpdateStudentRequest,
} from './students';
import type {
  AssignTeacherRequest, CreateTeacherRequest, RemoveTeachingAssignmentRequest,
  SetTeacherActiveRequest, TeacherDashboardResult, TeacherListRequest, TeacherPageResult,
  TeacherProfileResult, TeachingAssignmentResult, UpdateTeacherRequest,
  UpdateTeachingAssignmentRequest,
} from './teachers';
import type { AuthenticateRequest, ProvisioningStatus } from './provisioning';

export interface AuthenticationApi {
  getStatus(): Promise<ProvisioningStatus>;
  login(request: AuthenticateRequest): Promise<ProvisioningStatus>;
  logout(): Promise<ProvisioningStatus>;
}

export interface ProvisioningApi {
  start(): Promise<ProvisioningStatus>;
}

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
export interface StudentApi {
  list(request: StudentListRequest): Promise<StudentPageResult>;
  get(id: string): Promise<StudentResult | null>;
  create(request: CreateStudentRequest): Promise<StudentResult>;
  update(request: UpdateStudentRequest): Promise<StudentResult>;
  setActive(request: SetStudentActiveRequest): Promise<StudentResult>;
  createGuardian(request: CreateGuardianRequest): Promise<StudentResult>;
  enroll(request: EnrollStudentRequest): Promise<EnrollmentResult>;
  moveClass(request: MoveEnrollmentClassRequest): Promise<EnrollmentResult>;
  listEnrollments(id: string): Promise<EnrollmentResult[]>;
}
export interface TeacherApi {
  list(request: TeacherListRequest): Promise<TeacherPageResult>;
  getProfile(id: string): Promise<TeacherProfileResult | null>;
  create(request: CreateTeacherRequest): Promise<TeacherProfileResult>;
  update(request: UpdateTeacherRequest): Promise<TeacherProfileResult>;
  setActive(request: SetTeacherActiveRequest): Promise<TeacherProfileResult>;
  listAssignments(id: string): Promise<TeachingAssignmentResult[]>;
  assign(request: AssignTeacherRequest): Promise<TeachingAssignmentResult>;
  updateAssignment(request: UpdateTeachingAssignmentRequest): Promise<TeachingAssignmentResult>;
  removeAssignment(request: RemoveTeachingAssignmentRequest): Promise<{ id: string }>;
  getDashboard(): Promise<TeacherDashboardResult>;
}

export interface NemisApi {
  auth: AuthenticationApi;
  provisioning: ProvisioningApi;
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
  student: StudentApi;
  teacher: TeacherApi;
}
