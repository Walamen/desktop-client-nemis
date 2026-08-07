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
  InstitutionSummaryResult,
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
  StudentStatisticsResult,
  UpdateStudentRequest,
} from './students';
import type {
  AssignTeacherRequest,
  CreateTeacherRequest,
  RemoveTeachingAssignmentRequest,
  SetTeacherActiveRequest,
  TeacherDashboardResult,
  TeacherListRequest,
  TeacherPageResult,
  TeacherProfileResult,
  TeachingAssignmentResult,
  UpdateTeacherRequest,
  UpdateTeachingAssignmentRequest,
} from './teachers';
import type { AuthenticateRequest, ProvisioningStatus } from './provisioning';
import type {
  SchoolAdminDeleteRequest,
  SchoolAdminListRequest,
  SchoolAdminListResult,
  SchoolAdminRecord,
  SchoolAdminSaveRequest,
} from './school-admin';
import type {
  CopyTimetableRequest,
  CreateTimetableEntryRequest,
  PeriodResult,
  ScheduleConflictResult,
  TimetableDashboardResult,
  TimetableEntryResult,
  TimetableListRequest,
  TimetablePageResult,
  UpdateTimetableEntryRequest,
  ValidateTimetableRequest,
} from './timetables';
import type {
  AttendanceListRequest,
  AttendanceResult,
  RecordAttendanceRequest,
} from './attendance';
import type { DesktopSyncStatus, ResolveSyncConflictRequest, SyncConflictResult } from './sync';
import type {
  AssignmentResult,
  AssignmentSubmissionResult,
  CreateAssignmentRequest,
  GradeSubmissionRequest,
  ListAssignmentsRequest,
  PickAttachmentResult,
  UpdateAssignmentRequest,
} from './assignments';

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
export interface InstitutionApi {
  /** Every institution present in this device's local database — for
   * School Admin/Teacher that's their own one institution; for County/DEO/
   * Ministry it's every institution the backend scoped into their sync
   * snapshot (see Nemis/apps/Server desktop-provisioning.service.ts). No
   * role branching needed here: the local data is already scoped. */
  list(): Promise<InstitutionSummaryResult[]>;
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
  getStatistics(): Promise<StudentStatisticsResult>;
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
export interface TimetableApi {
  list(request: TimetableListRequest): Promise<TimetablePageResult>;
  getClassSchedule(id: string): Promise<TimetablePageResult>;
  getTeacherSchedule(id: string): Promise<TimetablePageResult>;
  getSubjectSchedule(id: string): Promise<TimetablePageResult>;
  create(request: CreateTimetableEntryRequest): Promise<TimetableEntryResult>;
  update(request: UpdateTimetableEntryRequest): Promise<TimetableEntryResult>;
  delete(id: string): Promise<{ id: string }>;
  copy(request: CopyTimetableRequest): Promise<TimetableEntryResult[]>;
  validate(request: ValidateTimetableRequest): Promise<ScheduleConflictResult[]>;
  detectConflicts(request: TimetableListRequest): Promise<ScheduleConflictResult[]>;
  periods(classId?: string): Promise<PeriodResult[]>;
  dashboard(dayOfWeek: string): Promise<TimetableDashboardResult>;
}
export interface SyncApi {
  run(): Promise<DesktopSyncStatus>;
  getStatus(): Promise<DesktopSyncStatus>;
  listConflicts(): Promise<SyncConflictResult[]>;
  resolveConflict(request: ResolveSyncConflictRequest): Promise<SyncConflictResult>;
}
export interface AttendanceApi {
  list(request: AttendanceListRequest): Promise<AttendanceResult[]>;
  record(request: RecordAttendanceRequest): Promise<AttendanceResult>;
}
export interface SchoolAdminApi {
  list(request: SchoolAdminListRequest): Promise<SchoolAdminListResult>;
  save(request: SchoolAdminSaveRequest): Promise<SchoolAdminRecord>;
  delete(request: SchoolAdminDeleteRequest): Promise<{ id: string }>;
}
export interface AssignmentApi {
  list(request: ListAssignmentsRequest): Promise<AssignmentResult[]>;
  get(id: string): Promise<AssignmentResult | null>;
  create(request: CreateAssignmentRequest): Promise<AssignmentResult>;
  update(request: UpdateAssignmentRequest): Promise<AssignmentResult>;
  delete(id: string): Promise<{ id: string }>;
  listSubmissions(assignmentId: string): Promise<AssignmentSubmissionResult[]>;
  gradeSubmission(request: GradeSubmissionRequest): Promise<AssignmentSubmissionResult>;
  pickAttachment(): Promise<PickAttachmentResult | null>;
  openAttachment(attachmentUrl: string): Promise<{ opened: boolean }>;
}

export interface NemisApi {
  auth: AuthenticationApi;
  provisioning: ProvisioningApi;
  sync: SyncApi;
  system: SystemApi;
  settings: SettingsApi;
  dashboard: DashboardApi;
  school: SchoolApi;
  institution: InstitutionApi;
  academicYear: AcademicYearApi;
  term: TermApi;
  classes: ClassesApi;
  subject: SubjectApi;
  identity: IdentityApi;
  device: DeviceApi;
  student: StudentApi;
  teacher: TeacherApi;
  timetable: TimetableApi;
  attendance: AttendanceApi;
  schoolAdmin: SchoolAdminApi;
  assignment: AssignmentApi;
}
