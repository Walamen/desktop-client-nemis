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
  SchoolAdminDeleteRequest,
  SchoolAdminListRequest,
  SchoolAdminListResult,
  SchoolAdminRecord,
  SchoolAdminReversePaymentRequest,
  SchoolAdminSaveRequest,
} from './school-admin';

/**
 * Single source of truth for every IPC endpoint's request/response types.
 * Add an endpoint by adding an entry here first — the main-process
 * registrar and the preload bridge are both keyed off this map.
 * Channel naming convention: `domain:action`.
 */
export interface IpcContract {
  'auth:get-status': { args: []; result: ProvisioningStatus };
  'auth:login': { args: [request: AuthenticateRequest]; result: ProvisioningStatus };
  'auth:logout': { args: []; result: ProvisioningStatus };
  'provisioning:start': { args: []; result: ProvisioningStatus };
  'sync:run': { args: []; result: DesktopSyncStatus };
  'sync:get-status': { args: []; result: DesktopSyncStatus };
  'sync:list-conflicts': { args: []; result: SyncConflictResult[] };
  'sync:resolve-conflict': {
    args: [request: ResolveSyncConflictRequest];
    result: SyncConflictResult;
  };
  'sync:list-pending': { args: []; result: PendingSummary };
  'sync:list-pending-records': {
    args: [request: ListPendingRecordsRequest];
    result: ListPendingRecordsResult;
  };
  'system:get-version': { args: []; result: string };
  'settings:get': { args: [key: string]; result: unknown };
  'dashboard:get-overview': { args: []; result: DashboardOverviewResult };
  'county:get-dashboard': { args: []; result: CountyDashboardResult };
  'county:list-districts': { args: []; result: CountyDistrictsResult };
  'county:get-district': { args: [districtId: string]; result: CountyDistrictDetailResult | null };
  'county:assign-deo': { args: [request: CountyAssignDeoRequest]; result: OnlineCommandResult<null> };
  'county:remove-deo': { args: [request: CountyRemoveDeoRequest]; result: OnlineCommandResult<null> };
  'county:list-schools': { args: []; result: CountySchoolsResult };
  'county:get-school': { args: [schoolId: string]; result: CountySchoolDetailResult | null };
  'county:get-registration-context': { args: []; result: SchoolRegistrationContext };
  'county:register-schools': { args: [request: RegisterSchoolsRequest]; result: RegisterSchoolsResult };
  'county:resubmit-school-registration': { args: [request: ResubmitSchoolRegistrationRequest]; result: RegisterSchoolsResult };
  'county:discard-school-registration': { args: [id: string]; result: { discarded: boolean } };
  'county:get-school-registrations': { args: [ids: string[]]; result: SchoolRegistration[] };
  'county:settle-school-registrations': { args: [ids: string[], timeoutMs: number]; result: SchoolRegistration[] };
  'county:list-students': { args: [query: CountyStudentsQuery]; result: CountyStudentsResult };
  'county:get-student': { args: [studentId: string]; result: CountyStudentDetail | null };
  'county:get-student-record': { args: [studentId: string]; result: StudentAcademicRecordResult };
  'county:list-guardians': { args: [query: CountyGuardiansQuery]; result: CountyGuardiansResult };
  'county:get-guardian': { args: [guardianId: string]; result: CountyGuardianDetail | null };
  'county:list-teachers': { args: [query: CountyTeachersQuery]; result: CountyTeachersResult };
  'county:get-teacher': { args: [teacherId: string]; result: CountyTeacherDetail | null };
  'county:finance-dashboard': { args: []; result: CountyFinanceDashboard };
  'county:finance-schools': { args: []; result: CountySchoolFinanceRow[] };
  'county:finance-payments': { args: [query: CountyFeeCollectionsQuery]; result: CountyFeeCollectionsResult };
  'county:finance-fee-rules': { args: [query: CountyFeeRulesQuery]; result: CountyFeeRulesResult };
  'county:list-users': { args: [query: CountyUsersQuery]; result: CountyUsersResult };
  'county:get-user-options': { args: []; result: CountyUserOptions };
  'county:set-user-active': { args: [request: CountySetUserActiveRequest]; result: OnlineCommandResult<null> };
  'county:assign-user': { args: [request: CountyAssignUserRequest]; result: OnlineCommandResult<null> };
  'county:get-activation-link': { args: [userId: string]; result: OnlineCommandResult<CountyActivationLink> };
  'county:create-user': { args: [request: CountyCreateUserRequest]; result: OnlineCommandResult<CountyCreateUserResult> };
  'county:bulk-create-users': {
    args: [rows: CountyBulkUserRow[]];
    result: OnlineCommandResult<CountyBulkCreateUsersResult>;
  };
  'school:get-summary': { args: []; result: SchoolSummaryResult | null };
  'institution:list': { args: []; result: InstitutionSummaryResult[] };
  'academic-year:get-current': { args: []; result: AcademicYearResult | null };
  'identity:get-current-user': { args: []; result: CurrentUserResult | null };
  'device:get-info': { args: []; result: DeviceInfoResult | null };
  // Academic Foundation (Phase 9)
  'academic-year:list': { args: []; result: AcademicYearListItemResult[] };
  'academic-year:create': {
    args: [request: CreateAcademicYearRequest];
    result: AcademicYearListItemResult;
  };
  'academic-year:update': {
    args: [request: UpdateAcademicYearRequest];
    result: AcademicYearListItemResult;
  };
  'academic-year:set-current': { args: [id: string]; result: AcademicYearListItemResult };
  'academic-year:set-status': {
    args: [request: SetAcademicYearStatusRequest];
    result: AcademicYearListItemResult;
  };
  'term:list': { args: [academicYearId: string]; result: TermResult[] };
  'term:get-current': { args: []; result: TermResult | null };
  'term:create': { args: [request: CreateTermRequest]; result: TermResult };
  'term:update': { args: [request: UpdateTermRequest]; result: TermResult };
  'term:set-current': { args: [id: string]; result: TermResult };
  'term:delete': { args: [id: string]; result: DeletedResult };
  'class:list': { args: [request: ClassListRequest]; result: PagedListResult<ClassResult> };
  'class:create': { args: [request: CreateClassRequest]; result: ClassResult };
  'class:update': { args: [request: UpdateClassRequest]; result: ClassResult };
  'class:set-active': { args: [request: SetActiveRequest]; result: ClassResult };
  'class:grade-level-counts': { args: []; result: GradeLevelCountResult[] };
  'subject:list': { args: [request: SubjectListRequest]; result: PagedListResult<SubjectResult> };
  'subject:create': { args: [request: CreateSubjectRequest]; result: SubjectResult };
  'subject:update': { args: [request: UpdateSubjectRequest]; result: SubjectResult };
  'subject:set-active': { args: [request: SetActiveRequest]; result: SubjectResult };
  'class-subject:list': { args: [classId: string]; result: ClassSubjectResult[] };
  'class-subject:assign': { args: [request: ClassSubjectPairRequest]; result: ClassSubjectResult };
  'class-subject:unassign': { args: [request: ClassSubjectPairRequest]; result: DeletedResult };
  // Student Management (Phase 10)
  'student:list': { args: [request: StudentListRequest]; result: StudentPageResult };
  'student:get': { args: [id: string]; result: StudentResult | null };
  'student:create': { args: [request: CreateStudentRequest]; result: StudentResult };
  'student:create-and-enroll': { args: [request: CreateAndEnrollStudentRequest]; result: StudentResult };
  'student:update': { args: [request: UpdateStudentRequest]; result: StudentResult };
  'student:set-active': { args: [request: SetStudentActiveRequest]; result: StudentResult };
  'student:create-guardian': { args: [request: CreateGuardianRequest]; result: StudentResult };
  'student:enroll': { args: [request: EnrollStudentRequest]; result: EnrollmentResult };
  'student:move-class': {
    args: [request: MoveEnrollmentClassRequest];
    result: EnrollmentResult;
  };
  'student:list-enrollments': { args: [id: string]; result: EnrollmentResult[] };
  'student:get-statistics': { args: []; result: StudentStatisticsResult };
  'student:create-synced': { args: [studentId: string]; result: { synced: boolean } };
  // Teacher Management (Phase 11)
  'teacher:list': { args: [request: TeacherListRequest]; result: TeacherPageResult };
  'teacher:get-profile': { args: [id: string]; result: TeacherProfileResult | null };
  'teacher:create': { args: [request: CreateTeacherRequest]; result: TeacherProfileResult };
  'teacher:update': { args: [request: UpdateTeacherRequest]; result: TeacherProfileResult };
  'teacher:set-active': { args: [request: SetTeacherActiveRequest]; result: TeacherProfileResult };
  'teacher:list-assignments': { args: [id: string]; result: TeachingAssignmentResult[] };
  'teacher:assign': { args: [request: AssignTeacherRequest]; result: TeachingAssignmentResult };
  'teacher:update-assignment': {
    args: [request: UpdateTeachingAssignmentRequest];
    result: TeachingAssignmentResult;
  };
  'teacher:remove-assignment': {
    args: [request: RemoveTeachingAssignmentRequest];
    result: { id: string };
  };
  'teacher:get-dashboard': { args: []; result: TeacherDashboardResult };
  // Timetable Management (Phase 13)
  'timetable:list': { args: [request: TimetableListRequest]; result: TimetablePageResult };
  'timetable:class': { args: [id: string]; result: TimetablePageResult };
  'timetable:teacher': { args: [id: string]; result: TimetablePageResult };
  'timetable:subject': { args: [id: string]; result: TimetablePageResult };
  'timetable:create': {
    args: [request: CreateTimetableEntryRequest];
    result: TimetableEntryResult;
  };
  'timetable:update': {
    args: [request: UpdateTimetableEntryRequest];
    result: TimetableEntryResult;
  };
  'timetable:delete': { args: [id: string]; result: { id: string } };
  'timetable:copy': { args: [request: CopyTimetableRequest]; result: TimetableEntryResult[] };
  'timetable:validate': {
    args: [request: ValidateTimetableRequest];
    result: ScheduleConflictResult[];
  };
  'timetable:conflicts': {
    args: [request: TimetableListRequest];
    result: ScheduleConflictResult[];
  };
  'timetable:periods': { args: [classId?: string]; result: PeriodResult[] };
  'timetable:dashboard': { args: [dayOfWeek: string]; result: TimetableDashboardResult };
  'attendance:list': { args: [request: AttendanceListRequest]; result: AttendanceResult[] };
  'attendance:record': { args: [request: RecordAttendanceRequest]; result: AttendanceResult };
  'assignment:list': { args: [request: ListAssignmentsRequest]; result: AssignmentResult[] };
  'assignment:get': { args: [id: string]; result: AssignmentResult | null };
  'assignment:create': { args: [request: CreateAssignmentRequest]; result: AssignmentResult };
  'assignment:update': { args: [request: UpdateAssignmentRequest]; result: AssignmentResult };
  'assignment:delete': { args: [id: string]; result: { id: string } };
  'assignment:list-submissions': {
    args: [assignmentId: string];
    result: AssignmentSubmissionResult[];
  };
  'assignment:grade-submission': {
    args: [request: GradeSubmissionRequest];
    result: AssignmentSubmissionResult;
  };
  'assignment:pick-attachment': { args: []; result: PickAttachmentResult | null };
  'assignment:open-attachment': { args: [attachmentUrl: string]; result: { opened: boolean } };
  'school-admin:list': {
    args: [request: SchoolAdminListRequest];
    result: SchoolAdminListResult;
  };
  'school-admin:save': {
    args: [request: SchoolAdminSaveRequest];
    result: SchoolAdminRecord;
  };
  'school-admin:delete': {
    args: [request: SchoolAdminDeleteRequest];
    result: { id: string };
  };
  'school-admin:reverse-payment': {
    args: [request: SchoolAdminReversePaymentRequest];
    result: { id: string };
  };
  // Online-only commands (NEMIS ID desktop parity spec §6). These call the
  // server directly; mutations refresh local data with a forced pull.
  'registry:lookup': { args: [request: RegistryLookupRequest]; result: RegistryLookupResult };
  'registry:claim': {
    args: [request: RegistryClaimRequest];
    result: OnlineCommandResult<RegistryClaimResult>;
  };
  'registry:bulk-claim': {
    args: [request: BulkClaimRequest];
    result: OnlineCommandResult<BulkClaimResult>;
  };
  'registry:request': {
    args: [request: RegistryReleaseRequest];
    result: OnlineCommandResult<RegistryReleaseResult>;
  };
  'transfer:create': {
    args: [request: TransferCreateRequest];
    result: OnlineCommandResult<RemoteRecordRef>;
  };
  'transfer:review': {
    args: [request: TransferReviewRequest];
    result: OnlineCommandResult<RemoteRecordRef>;
  };
  'transfer:cancel': { args: [id: string]; result: OnlineCommandResult<RemoteRecordRef> };
  'transfer:search-schools': { args: [query: string]; result: SchoolSearchResult[] };
  'grade-completion:cohort': {
    args: [academicYearId: string, gradeLevel: GradeLevel];
    result: CohortResult;
  };
  'grade-completion:save': { args: [request: SaveCompletionsRequest]; result: SaveCompletionsResult };
  'grade-completion:guidance': {
    args: [academicYearId: string, gradeLevel: GradeLevel];
    result: CompletionGuidanceRow[];
  };
  'grade-completion:discard': {
    args: [academicYearId: string, studentId: string];
    result: DiscardCompletionResult;
  };
}

export type IpcChannel = keyof IpcContract;

export const IpcChannels = {
  AUTH_GET_STATUS: 'auth:get-status',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  PROVISIONING_START: 'provisioning:start',
  SYNC_RUN: 'sync:run',
  SYNC_GET_STATUS: 'sync:get-status',
  SYNC_LIST_CONFLICTS: 'sync:list-conflicts',
  SYNC_RESOLVE_CONFLICT: 'sync:resolve-conflict',
  SYNC_LIST_PENDING: 'sync:list-pending',
  SYNC_LIST_PENDING_RECORDS: 'sync:list-pending-records',
  SYSTEM_GET_VERSION: 'system:get-version',
  SETTINGS_GET: 'settings:get',
  DASHBOARD_GET_OVERVIEW: 'dashboard:get-overview',
  COUNTY_GET_DASHBOARD: 'county:get-dashboard',
  COUNTY_LIST_DISTRICTS: 'county:list-districts',
  COUNTY_GET_DISTRICT: 'county:get-district',
  COUNTY_ASSIGN_DEO: 'county:assign-deo',
  COUNTY_REMOVE_DEO: 'county:remove-deo',
  COUNTY_LIST_SCHOOLS: 'county:list-schools',
  COUNTY_GET_SCHOOL: 'county:get-school',
  COUNTY_GET_REGISTRATION_CONTEXT: 'county:get-registration-context',
  COUNTY_REGISTER_SCHOOLS: 'county:register-schools',
  COUNTY_RESUBMIT_SCHOOL_REGISTRATION: 'county:resubmit-school-registration',
  COUNTY_DISCARD_SCHOOL_REGISTRATION: 'county:discard-school-registration',
  COUNTY_GET_SCHOOL_REGISTRATIONS: 'county:get-school-registrations',
  COUNTY_SETTLE_SCHOOL_REGISTRATIONS: 'county:settle-school-registrations',
  COUNTY_LIST_STUDENTS: 'county:list-students',
  COUNTY_GET_STUDENT: 'county:get-student',
  COUNTY_GET_STUDENT_RECORD: 'county:get-student-record',
  COUNTY_LIST_GUARDIANS: 'county:list-guardians',
  COUNTY_GET_GUARDIAN: 'county:get-guardian',
  COUNTY_LIST_TEACHERS: 'county:list-teachers',
  COUNTY_GET_TEACHER: 'county:get-teacher',
  COUNTY_FINANCE_DASHBOARD: 'county:finance-dashboard',
  COUNTY_FINANCE_SCHOOLS: 'county:finance-schools',
  COUNTY_FINANCE_PAYMENTS: 'county:finance-payments',
  COUNTY_FINANCE_FEE_RULES: 'county:finance-fee-rules',
  COUNTY_LIST_USERS: 'county:list-users',
  COUNTY_GET_USER_OPTIONS: 'county:get-user-options',
  COUNTY_SET_USER_ACTIVE: 'county:set-user-active',
  COUNTY_ASSIGN_USER: 'county:assign-user',
  COUNTY_GET_ACTIVATION_LINK: 'county:get-activation-link',
  COUNTY_CREATE_USER: 'county:create-user',
  COUNTY_BULK_CREATE_USERS: 'county:bulk-create-users',
  SCHOOL_GET_SUMMARY: 'school:get-summary',
  INSTITUTION_LIST: 'institution:list',
  ACADEMIC_YEAR_GET_CURRENT: 'academic-year:get-current',
  IDENTITY_GET_CURRENT_USER: 'identity:get-current-user',
  DEVICE_GET_INFO: 'device:get-info',
  ACADEMIC_YEAR_LIST: 'academic-year:list',
  ACADEMIC_YEAR_CREATE: 'academic-year:create',
  ACADEMIC_YEAR_UPDATE: 'academic-year:update',
  ACADEMIC_YEAR_SET_CURRENT: 'academic-year:set-current',
  ACADEMIC_YEAR_SET_STATUS: 'academic-year:set-status',
  TERM_LIST: 'term:list',
  TERM_GET_CURRENT: 'term:get-current',
  TERM_CREATE: 'term:create',
  TERM_UPDATE: 'term:update',
  TERM_SET_CURRENT: 'term:set-current',
  TERM_DELETE: 'term:delete',
  CLASS_LIST: 'class:list',
  CLASS_CREATE: 'class:create',
  CLASS_UPDATE: 'class:update',
  CLASS_SET_ACTIVE: 'class:set-active',
  CLASS_GRADE_LEVEL_COUNTS: 'class:grade-level-counts',
  SUBJECT_LIST: 'subject:list',
  SUBJECT_CREATE: 'subject:create',
  SUBJECT_UPDATE: 'subject:update',
  SUBJECT_SET_ACTIVE: 'subject:set-active',
  CLASS_SUBJECT_LIST: 'class-subject:list',
  CLASS_SUBJECT_ASSIGN: 'class-subject:assign',
  CLASS_SUBJECT_UNASSIGN: 'class-subject:unassign',
  STUDENT_LIST: 'student:list',
  STUDENT_GET: 'student:get',
  STUDENT_CREATE: 'student:create',
  STUDENT_CREATE_AND_ENROLL: 'student:create-and-enroll',
  STUDENT_UPDATE: 'student:update',
  STUDENT_SET_ACTIVE: 'student:set-active',
  STUDENT_CREATE_GUARDIAN: 'student:create-guardian',
  STUDENT_ENROLL: 'student:enroll',
  STUDENT_MOVE_CLASS: 'student:move-class',
  STUDENT_LIST_ENROLLMENTS: 'student:list-enrollments',
  STUDENT_GET_STATISTICS: 'student:get-statistics',
  STUDENT_CREATE_SYNCED: 'student:create-synced',
  TEACHER_LIST: 'teacher:list',
  TEACHER_GET_PROFILE: 'teacher:get-profile',
  TEACHER_CREATE: 'teacher:create',
  TEACHER_UPDATE: 'teacher:update',
  TEACHER_SET_ACTIVE: 'teacher:set-active',
  TEACHER_LIST_ASSIGNMENTS: 'teacher:list-assignments',
  TEACHER_ASSIGN: 'teacher:assign',
  TEACHER_UPDATE_ASSIGNMENT: 'teacher:update-assignment',
  TEACHER_REMOVE_ASSIGNMENT: 'teacher:remove-assignment',
  TEACHER_GET_DASHBOARD: 'teacher:get-dashboard',
  TIMETABLE_LIST: 'timetable:list',
  TIMETABLE_CLASS: 'timetable:class',
  TIMETABLE_TEACHER: 'timetable:teacher',
  TIMETABLE_SUBJECT: 'timetable:subject',
  TIMETABLE_CREATE: 'timetable:create',
  TIMETABLE_UPDATE: 'timetable:update',
  TIMETABLE_DELETE: 'timetable:delete',
  TIMETABLE_COPY: 'timetable:copy',
  TIMETABLE_VALIDATE: 'timetable:validate',
  TIMETABLE_CONFLICTS: 'timetable:conflicts',
  TIMETABLE_PERIODS: 'timetable:periods',
  TIMETABLE_DASHBOARD: 'timetable:dashboard',
  ATTENDANCE_LIST: 'attendance:list',
  ATTENDANCE_RECORD: 'attendance:record',
  ASSIGNMENT_LIST: 'assignment:list',
  ASSIGNMENT_GET: 'assignment:get',
  ASSIGNMENT_CREATE: 'assignment:create',
  ASSIGNMENT_UPDATE: 'assignment:update',
  ASSIGNMENT_DELETE: 'assignment:delete',
  ASSIGNMENT_LIST_SUBMISSIONS: 'assignment:list-submissions',
  ASSIGNMENT_GRADE_SUBMISSION: 'assignment:grade-submission',
  ASSIGNMENT_PICK_ATTACHMENT: 'assignment:pick-attachment',
  ASSIGNMENT_OPEN_ATTACHMENT: 'assignment:open-attachment',
  SCHOOL_ADMIN_LIST: 'school-admin:list',
  SCHOOL_ADMIN_SAVE: 'school-admin:save',
  SCHOOL_ADMIN_DELETE: 'school-admin:delete',
  SCHOOL_ADMIN_REVERSE_PAYMENT: 'school-admin:reverse-payment',
  REGISTRY_LOOKUP: 'registry:lookup',
  REGISTRY_CLAIM: 'registry:claim',
  REGISTRY_REQUEST: 'registry:request',
  STUDENT_BULK_CLAIM: 'registry:bulk-claim',
  TRANSFER_CREATE: 'transfer:create',
  TRANSFER_REVIEW: 'transfer:review',
  TRANSFER_CANCEL: 'transfer:cancel',
  TRANSFER_SEARCH_SCHOOLS: 'transfer:search-schools',
  GRADE_COMPLETION_COHORT: 'grade-completion:cohort',
  GRADE_COMPLETION_SAVE: 'grade-completion:save',
  GRADE_COMPLETION_DISCARD: 'grade-completion:discard',
  GRADE_COMPLETION_GUIDANCE: 'grade-completion:guidance',
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
  | 'UNEXPECTED_ERROR'
  // Online-only commands (NEMIS ID desktop parity spec §6.2). The only codes
  // whose message may come from the server rather than a fixed table.
  | 'OFFLINE'
  | 'RATE_LIMITED'
  | 'REMOTE_REJECTED';

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
