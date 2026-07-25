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
  'system:get-version': { args: []; result: string };
  'settings:get': { args: [key: string]; result: unknown };
  'dashboard:get-overview': { args: []; result: DashboardOverviewResult };
  'school:get-summary': { args: []; result: SchoolSummaryResult | null };
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
  'student:update': { args: [request: UpdateStudentRequest]; result: StudentResult };
  'student:set-active': { args: [request: SetStudentActiveRequest]; result: StudentResult };
  'student:create-guardian': { args: [request: CreateGuardianRequest]; result: StudentResult };
  'student:enroll': { args: [request: EnrollStudentRequest]; result: EnrollmentResult };
  'student:move-class': {
    args: [request: MoveEnrollmentClassRequest];
    result: EnrollmentResult;
  };
  'student:list-enrollments': { args: [id: string]; result: EnrollmentResult[] };
  // Teacher Management (Phase 11)
  'teacher:list': { args: [request: TeacherListRequest]; result: TeacherPageResult };
  'teacher:get-profile': { args: [id: string]; result: TeacherProfileResult | null };
  'teacher:create': { args: [request: CreateTeacherRequest]; result: TeacherProfileResult };
  'teacher:update': { args: [request: UpdateTeacherRequest]; result: TeacherProfileResult };
  'teacher:set-active': { args: [request: SetTeacherActiveRequest]; result: TeacherProfileResult };
  'teacher:list-assignments': { args: [id: string]; result: TeachingAssignmentResult[] };
  'teacher:assign': { args: [request: AssignTeacherRequest]; result: TeachingAssignmentResult };
  'teacher:update-assignment': { args: [request: UpdateTeachingAssignmentRequest]; result: TeachingAssignmentResult };
  'teacher:remove-assignment': { args: [request: RemoveTeachingAssignmentRequest]; result: { id: string } };
  'teacher:get-dashboard': { args: []; result: TeacherDashboardResult };
}

export type IpcChannel = keyof IpcContract;

export const IpcChannels = {
  AUTH_GET_STATUS: 'auth:get-status',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  PROVISIONING_START: 'provisioning:start',
  SYSTEM_GET_VERSION: 'system:get-version',
  SETTINGS_GET: 'settings:get',
  DASHBOARD_GET_OVERVIEW: 'dashboard:get-overview',
  SCHOOL_GET_SUMMARY: 'school:get-summary',
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
  STUDENT_UPDATE: 'student:update',
  STUDENT_SET_ACTIVE: 'student:set-active',
  STUDENT_CREATE_GUARDIAN: 'student:create-guardian',
  STUDENT_ENROLL: 'student:enroll',
  STUDENT_MOVE_CLASS: 'student:move-class',
  STUDENT_LIST_ENROLLMENTS: 'student:list-enrollments',
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
