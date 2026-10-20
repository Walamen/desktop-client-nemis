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
import type { CountyDashboardResult } from './county-dashboard';
import type {
  CountyAssignDeoRequest,
  CountyDistrictDetailResult,
  CountyDistrictsResult,
  CountyRemoveDeoRequest,
} from './county-districts';
import type { CountySchoolDetailResult, CountySchoolsResult } from './county-schools';
import type {
  RegisterSchoolsRequest,
  RegisterSchoolsResult,
  ResubmitSchoolRegistrationRequest,
  SchoolRegistration,
  SchoolRegistrationContext,
} from './county-school-registrations';
import type {
  CountyStudentDetail,
  CountyStudentsQuery,
  CountyStudentsResult,
  StudentAcademicRecordResult,
} from './county-students';
import type { CountyGuardianDetail, CountyGuardiansQuery, CountyGuardiansResult } from './county-guardians';
import type { CountyTeacherDetail, CountyTeachersQuery, CountyTeachersResult } from './county-teachers';
import type {
  CountyFeeCollectionsQuery,
  CountyFeeCollectionsResult,
  CountyFeeRulesQuery,
  CountyFeeRulesResult,
  CountyFinanceDashboard,
  CountySchoolFinanceRow,
} from './county-finance';
import type {
  CountyActivationLink,
  CountyAssignUserRequest,
  CountyBulkCreateUsersResult,
  CountyBulkUserRow,
  CountyCreateUserRequest,
  CountyCreateUserResult,
  CountySetUserActiveRequest,
  CountyUserOptions,
  CountyUsersQuery,
  CountyUsersResult,
} from './county-users';
import type {
  CreateGuardianRequest,
  CreateStudentRequest,
  CreateAndEnrollStudentRequest,
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
  SchoolAdminReversePaymentRequest,
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
import type {
  DesktopSyncStatus,
  ListPendingRecordsRequest,
  ListPendingRecordsResult,
  PendingSummary,
  ResolveSyncConflictRequest,
  SyncConflictResult,
} from './sync';
import type {
  AssignmentResult,
  AssignmentSubmissionResult,
  CreateAssignmentRequest,
  GradeSubmissionRequest,
  ListAssignmentsRequest,
  PickAttachmentResult,
  UpdateAssignmentRequest,
} from './assignments';

import type {
  OnlineCommandResult,
  BulkClaimRequest,
  BulkClaimResult,
  RegistryClaimRequest,
  RegistryClaimResult,
  RegistryLookupRequest,
  RegistryLookupResult,
  RegistryReleaseRequest,
  RegistryReleaseResult,
  RemoteRecordRef,
  SchoolSearchResult,
  TransferCreateRequest,
  TransferReviewRequest,
} from './registry';
import type {
  CohortResult,
  CompletionGuidanceRow,
  DiscardCompletionResult,
  SaveCompletionsRequest,
  SaveCompletionsResult,
} from './grade-completions';
import type { GradeLevel } from './enums';

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
/** County (CEO) portal reads. */
export interface CountyApi {
  getDashboard(): Promise<CountyDashboardResult>;
  listDistricts(): Promise<CountyDistrictsResult>;
  getDistrict(districtId: string): Promise<CountyDistrictDetailResult | null>;
  assignDeo(request: CountyAssignDeoRequest): Promise<OnlineCommandResult<null>>;
  removeDeo(request: CountyRemoveDeoRequest): Promise<OnlineCommandResult<null>>;
  listSchools(): Promise<CountySchoolsResult>;
  getSchool(schoolId: string): Promise<CountySchoolDetailResult | null>;
  getRegistrationContext(): Promise<SchoolRegistrationContext>;
  registerSchools(request: RegisterSchoolsRequest): Promise<RegisterSchoolsResult>;
  resubmitSchoolRegistration(request: ResubmitSchoolRegistrationRequest): Promise<RegisterSchoolsResult>;
  discardSchoolRegistration(id: string): Promise<{ discarded: boolean }>;
  getSchoolRegistrations(ids: string[]): Promise<SchoolRegistration[]>;
  /** Runs a sync bounded by timeoutMs, then reads the registrations (the online wait after Save). */
  settleSchoolRegistrations(ids: string[], timeoutMs: number): Promise<SchoolRegistration[]>;
  listStudents(query: CountyStudentsQuery): Promise<CountyStudentsResult>;
  getStudent(studentId: string): Promise<CountyStudentDetail | null>;
  /** The student's national record from the server; 'unavailable' offline or on any failure. */
  getStudentRecord(studentId: string): Promise<StudentAcademicRecordResult>;
  listGuardians(query: CountyGuardiansQuery): Promise<CountyGuardiansResult>;
  getGuardian(guardianId: string): Promise<CountyGuardianDetail | null>;
  listTeachers(query: CountyTeachersQuery): Promise<CountyTeachersResult>;
  getTeacher(teacherId: string): Promise<CountyTeacherDetail | null>;
  /** Finance overview and Fee Rules, from this device's synced fee ledger. */
  getFinanceDashboard(): Promise<CountyFinanceDashboard>;
  listFinanceSchools(): Promise<CountySchoolFinanceRow[]>;
  listFeeCollections(query: CountyFeeCollectionsQuery): Promise<CountyFeeCollectionsResult>;
  listFeeRules(query: CountyFeeRulesQuery): Promise<CountyFeeRulesResult>;
  listUsers(query: CountyUsersQuery): Promise<CountyUsersResult>;
  getUserOptions(): Promise<CountyUserOptions>;
  /** Online-only user commands; each forces a pull afterwards. */
  setUserActive(request: CountySetUserActiveRequest): Promise<OnlineCommandResult<null>>;
  assignUser(request: CountyAssignUserRequest): Promise<OnlineCommandResult<null>>;
  /** Only the URL crosses IPC; the activation token never does. */
  getActivationLink(userId: string): Promise<OnlineCommandResult<CountyActivationLink>>;
  createUser(request: CountyCreateUserRequest): Promise<OnlineCommandResult<CountyCreateUserResult>>;
  bulkCreateUsers(rows: CountyBulkUserRow[]): Promise<OnlineCommandResult<CountyBulkCreateUsersResult>>;
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
  createAndEnroll(request: CreateAndEnrollStudentRequest): Promise<StudentResult>;
  update(request: UpdateStudentRequest): Promise<StudentResult>;
  setActive(request: SetStudentActiveRequest): Promise<StudentResult>;
  createGuardian(request: CreateGuardianRequest): Promise<StudentResult>;
  enroll(request: EnrollStudentRequest): Promise<EnrollmentResult>;
  moveClass(request: MoveEnrollmentClassRequest): Promise<EnrollmentResult>;
  listEnrollments(id: string): Promise<EnrollmentResult[]>;
  getStatistics(): Promise<StudentStatisticsResult>;
  /** False while the student's local create is still queued (no portal login yet). */
  isCreateSynced(studentId: string): Promise<{ synced: boolean }>;
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
  listPending(): Promise<PendingSummary>;
  listPendingRecords(request: ListPendingRecordsRequest): Promise<ListPendingRecordsResult>;
}
export interface AttendanceApi {
  list(request: AttendanceListRequest): Promise<AttendanceResult[]>;
  record(request: RecordAttendanceRequest): Promise<AttendanceResult>;
}
export interface SchoolAdminApi {
  list(request: SchoolAdminListRequest): Promise<SchoolAdminListResult>;
  save(request: SchoolAdminSaveRequest): Promise<SchoolAdminRecord>;
  delete(request: SchoolAdminDeleteRequest): Promise<{ id: string }>;
  reversePayment(request: SchoolAdminReversePaymentRequest): Promise<{ id: string }>;
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

export interface RegistryApi {
  lookup(request: RegistryLookupRequest): Promise<RegistryLookupResult>;
  claim(request: RegistryClaimRequest): Promise<OnlineCommandResult<RegistryClaimResult>>;
  request(request: RegistryReleaseRequest): Promise<OnlineCommandResult<RegistryReleaseResult>>;
  bulkClaim(request: BulkClaimRequest): Promise<OnlineCommandResult<BulkClaimResult>>;
}

export interface TransferApi {
  create(request: TransferCreateRequest): Promise<OnlineCommandResult<RemoteRecordRef>>;
  review(request: TransferReviewRequest): Promise<OnlineCommandResult<RemoteRecordRef>>;
  cancel(id: string): Promise<OnlineCommandResult<RemoteRecordRef>>;
  searchSchools(query: string): Promise<SchoolSearchResult[]>;
}

/** End-of-year outcomes (NEMIS ID desktop parity, Stage 5): the local cohort
 * and pending decisions, pushed later by their own sync path. */
export interface GradeCompletionApi {
  cohort(academicYearId: string, gradeLevel: GradeLevel): Promise<CohortResult>;
  save(request: SaveCompletionsRequest): Promise<SaveCompletionsResult>;
  discard(academicYearId: string, studentId: string): Promise<DiscardCompletionResult>;
  /** Online only: the server's published averages per student; rejects offline. */
  guidance(academicYearId: string, gradeLevel: GradeLevel): Promise<CompletionGuidanceRow[]>;
}

export interface NemisApi {
  auth: AuthenticationApi;
  provisioning: ProvisioningApi;
  sync: SyncApi;
  system: SystemApi;
  settings: SettingsApi;
  dashboard: DashboardApi;
  county: CountyApi;
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
  registry: RegistryApi;
  transfer: TransferApi;
  gradeCompletion: GradeCompletionApi;
}
