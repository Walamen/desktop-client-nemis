import { ForbiddenError, UnauthorizedError } from '@nemis-desktop/shared';
import {
  canUseSchoolAccess,
  hasModule,
  IpcChannels,
  SchoolModule,
  schoolAccessLabel,
  SystemRole,
  type IpcChannel,
  type SchoolAccess,
} from '@nemis-desktop/types';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';

/** A channel's office-staff access: one SchoolAccess value, or a list of
 * modules of which the user needs at least one (any-of). */
export type ChannelAccess = SchoolAccess | readonly SchoolModule[];

export const PUBLIC_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  IpcChannels.AUTH_GET_STATUS,
  IpcChannels.AUTH_LOGIN,
  IpcChannels.AUTH_LOGOUT,
  IpcChannels.PROVISIONING_START,
  IpcChannels.SYSTEM_GET_VERSION,
]);

// School-management channels — both the mutations (create/update/delete) and
// the reads that expose the same institution-wide data (dashboard totals,
// full teacher/timetable/enrollment records, etc). Restricted to
// INSTITUTION_ADMIN and, per the access value, INSTITUTION_STAFF holding that
// module; none of it is needed by a teacher's own screens.
export const SCHOOL_ADMIN_CHANNELS: ReadonlyMap<IpcChannel, ChannelAccess> = new Map<IpcChannel, ChannelAccess>([
  // Mutations
  // Online-only registry and transfer commands (NEMIS ID parity §6.2).
  [IpcChannels.REGISTRY_LOOKUP, SchoolModule.STUDENTS],
  [IpcChannels.REGISTRY_LOOKUP_BY_NAME, SchoolModule.STUDENTS],
  [IpcChannels.REGISTRY_CLAIM, SchoolModule.STUDENTS],
  [IpcChannels.REGISTRY_REQUEST, SchoolModule.STUDENTS],
  [IpcChannels.STUDENT_BULK_CLAIM, SchoolModule.STUDENTS],
  [IpcChannels.TRANSFER_CREATE, SchoolModule.STUDENTS],
  [IpcChannels.TRANSFER_REVIEW, SchoolModule.STUDENTS],
  [IpcChannels.TRANSFER_CANCEL, SchoolModule.STUDENTS],
  [IpcChannels.TRANSFER_RECORD_PREVIEW, SchoolModule.STUDENTS],
  [IpcChannels.TRANSFER_MATCHING_DRAFT_SAVE, SchoolModule.STUDENTS],
  [IpcChannels.TRANSFER_MATCHING_DRAFT_CLEAR, SchoolModule.STUDENTS],
  [IpcChannels.TRANSFER_SEARCH_SCHOOLS, SchoolModule.STUDENTS],
  [IpcChannels.ACADEMIC_YEAR_CREATE, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.ACADEMIC_YEAR_UPDATE, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.ACADEMIC_YEAR_START, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.ACADEMIC_YEAR_COPY_STRUCTURE, SchoolModule.ACADEMIC_SETUP],
  // Close Academic Year (lifecycle Stage 3): online-only commands and the
  // server reads behind the close workflow.
  [IpcChannels.CLOSE_GET_READINESS, 'PRINCIPAL'],
  [IpcChannels.CLOSE_FILL_CELLS, 'PRINCIPAL'],
  [IpcChannels.CLOSE_GET_PROMOTION, 'PRINCIPAL'],
  [IpcChannels.CLOSE_SAVE_PROMOTION, 'PRINCIPAL'],
  [IpcChannels.CLOSE_YEAR, 'PRINCIPAL'],
  [IpcChannels.REOPEN_YEAR, 'PRINCIPAL'],
  [IpcChannels.CORRECT_GRADE, 'PRINCIPAL'],
  [IpcChannels.CORRECT_OUTCOME, 'PRINCIPAL'],
  [IpcChannels.CORRECT_REMARK, 'PRINCIPAL'],
  [IpcChannels.CLOSE_PENDING_CHANGES_COUNT, 'PRINCIPAL'],
  // Match prior record (lifecycle Stage 5): online reads and the one save.
  [IpcChannels.CARRY_OVER_LIST_PENDING, SchoolModule.STUDENTS],
  [IpcChannels.CARRY_OVER_LIST_LOCAL_PENDING, SchoolModule.STUDENTS],
  [IpcChannels.CARRY_OVER_GET, SchoolModule.STUDENTS],
  [IpcChannels.CARRY_OVER_SAVE, SchoolModule.STUDENTS],
  [IpcChannels.TERM_CREATE, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.TERM_UPDATE, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.TERM_SET_CURRENT, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.TERM_DELETE, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.CLASS_CREATE, SchoolModule.TEACHING],
  [IpcChannels.CLASS_UPDATE, SchoolModule.TEACHING],
  [IpcChannels.CLASS_SET_ACTIVE, SchoolModule.TEACHING],
  [IpcChannels.CLASS_SUBJECT_ASSIGN, SchoolModule.TEACHING],
  [IpcChannels.CLASS_SUBJECT_UNASSIGN, SchoolModule.TEACHING],
  [IpcChannels.SUBJECT_CREATE, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.SUBJECT_UPDATE, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.SUBJECT_SET_ACTIVE, SchoolModule.ACADEMIC_SETUP],
  [IpcChannels.STUDENT_CREATE, SchoolModule.STUDENTS],
  [IpcChannels.STUDENT_CREATE_AND_ENROLL, SchoolModule.STUDENTS],
  [IpcChannels.STUDENT_UPDATE, SchoolModule.STUDENTS],
  [IpcChannels.STUDENT_SET_ACTIVE, SchoolModule.STUDENTS],
  [IpcChannels.STUDENT_CREATE_GUARDIAN, SchoolModule.STUDENTS],
  [IpcChannels.STUDENT_ENROLL, SchoolModule.STUDENTS],
  [IpcChannels.STUDENT_MOVE_CLASS, SchoolModule.STUDENTS],
  [IpcChannels.TEACHER_CREATE, SchoolModule.STAFF],
  [IpcChannels.TEACHER_UPDATE, SchoolModule.STAFF],
  [IpcChannels.TEACHER_SET_ACTIVE, SchoolModule.STAFF],
  [IpcChannels.TEACHER_ASSIGN, SchoolModule.STAFF],
  [IpcChannels.TEACHER_UPDATE_ASSIGNMENT, SchoolModule.STAFF],
  [IpcChannels.TEACHER_REMOVE_ASSIGNMENT, SchoolModule.STAFF],
  [IpcChannels.TIMETABLE_CREATE, SchoolModule.TEACHING],
  [IpcChannels.TIMETABLE_UPDATE, SchoolModule.TEACHING],
  [IpcChannels.TIMETABLE_DELETE, SchoolModule.TEACHING],
  [IpcChannels.TIMETABLE_COPY, SchoolModule.TEACHING],

  // Reads — institution-wide data with no teacher-facing screen behind it.
  [IpcChannels.DASHBOARD_GET_OVERVIEW, 'BASE'],
  [IpcChannels.SCHOOL_GET_SUMMARY, 'BASE'],
  [IpcChannels.ACADEMIC_YEAR_LIST, 'BASE'],
  [IpcChannels.TERM_GET_CURRENT, 'BASE'],
  [IpcChannels.SUBJECT_LIST, 'BASE'],
  [IpcChannels.CLASS_GRADE_LEVEL_COUNTS, 'BASE'],
  [IpcChannels.CLASS_SUBJECT_LIST, 'BASE'],
  [IpcChannels.TEACHER_LIST, 'BASE'],
  [IpcChannels.TEACHER_GET_PROFILE, 'BASE'],
  [IpcChannels.TIMETABLE_LIST, SchoolModule.TEACHING],
  [IpcChannels.TIMETABLE_CLASS, SchoolModule.TEACHING],
  [IpcChannels.TIMETABLE_SUBJECT, SchoolModule.TEACHING],
  [IpcChannels.TIMETABLE_DASHBOARD, 'BASE'],
  [IpcChannels.TIMETABLE_CONFLICTS, SchoolModule.TEACHING],
  [IpcChannels.STUDENT_GET, 'BASE'],
  [IpcChannels.STUDENT_LIST_ENROLLMENTS, 'BASE'],
  [IpcChannels.STUDENT_GET_STATISTICS, 'BASE'],
  [IpcChannels.STUDENT_CREATE_SYNCED, SchoolModule.STUDENTS],

  // Office-user management: principal-only, never delegable.
  [IpcChannels.SCHOOL_USERS_LIST, 'PRINCIPAL'],
  [IpcChannels.SCHOOL_USERS_CREATE, 'PRINCIPAL'],
  [IpcChannels.SCHOOL_USERS_UPDATE, 'PRINCIPAL'],
  [IpcChannels.SCHOOL_USERS_SET_ACTIVE, 'PRINCIPAL'],
]);

// Reads a teacher's own screens genuinely need, in addition to school
// admins: AttendancePage.tsx loads the class picker (CLASS_LIST) and the
// class roster (STUDENT_LIST) before it can record attendance.
// TEACHER_LIST_ASSIGNMENTS backs the teacher's own dashboard (their classes,
// subjects, homeroom flag) — the handler self-scopes a TEACHER caller to
// their own id, see teacherDirectory.ts. TIMETABLE_TEACHER backs the
// teacher's own Timetable page the same way — see timetables.ts.
// TIMETABLE_PERIODS, ACADEMIC_YEAR_GET_CURRENT and TERM_LIST are structural
// institution-wide data (bell schedule, current year, term list) that the
// Timetable and Gradebook pages need to render — not teacher- or
// class-specific, so none of them need self-scoping.
// ATTENDANCE_LIST is any-of TEACHING | REPORTS: the attendance report reads it.
export const SCHOOL_STAFF_CHANNELS: ReadonlyMap<IpcChannel, ChannelAccess> = new Map<IpcChannel, ChannelAccess>([
  // Stage 5: carried marks, read-only in the teacher's grade grid.
  [IpcChannels.CARRIED_GRADES_FOR_PERIOD, SchoolModule.TEACHING],
  [IpcChannels.ATTENDANCE_LIST, [SchoolModule.TEACHING, SchoolModule.REPORTS]],
  [IpcChannels.ATTENDANCE_RECORD, SchoolModule.TEACHING],
  [IpcChannels.CLASS_LIST, 'BASE'],
  [IpcChannels.STUDENT_LIST, 'BASE'],
  [IpcChannels.TEACHER_LIST_ASSIGNMENTS, 'BASE'],
  [IpcChannels.TIMETABLE_TEACHER, SchoolModule.TEACHING],
  [IpcChannels.TIMETABLE_PERIODS, 'BASE'],
  [IpcChannels.ACADEMIC_YEAR_GET_CURRENT, 'BASE'],
  [IpcChannels.TERM_LIST, 'BASE'],
  [IpcChannels.ACADEMIC_CONTEXT_GET, 'BASE'],
  // Report cards (academic-year lifecycle Stage 2): the read model scopes a
  // TEACHER to the classes they are assigned to, see SqliteReportCardReadModel.
  [IpcChannels.REPORT_CARDS_LIST_FOR_STUDENT, SchoolModule.REPORTS],
  [IpcChannels.REPORT_CARDS_LIST_FOR_CLASS, SchoolModule.REPORTS],
  [IpcChannels.REPORT_CARD_GET_ISSUE, SchoolModule.REPORTS],
  [IpcChannels.REPORT_CARDS_LIST_ARCHIVED_YEARS, SchoolModule.REPORTS],
]);

// Report-card channels are also members of SCHOOL_STAFF_CHANNELS; they are
// checked first so a refusal names report cards, not attendance. Office staff
// reach them through the REPORTS module in SCHOOL_STAFF_CHANNELS.
export const REPORT_CARD_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  IpcChannels.REPORT_CARDS_LIST_FOR_STUDENT,
  IpcChannels.REPORT_CARDS_LIST_FOR_CLASS,
  IpcChannels.REPORT_CARD_GET_ISSUE,
  IpcChannels.REPORT_CARDS_LIST_ARCHIVED_YEARS,
]);

// Closed academic years across the schools a district or county oversees.
export const GOVERNMENT_YEAR_ARCHIVE_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([IpcChannels.YEAR_ARCHIVES_LIST]);

// Teacher-exclusive channels — unlike attendance, the web app has no
// school-admin-facing assignments screen at all, so these stay closed to
// INSTITUTION_ADMIN rather than falling into SCHOOL_STAFF_CHANNELS. Ownership
// (teacherId) is injected server-side from workspaces.active.user.staffId in
// the handler, never trusted from the renderer — see handlers/teacher/assignments.ts.
export const TEACHER_ONLY_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  IpcChannels.ASSIGNMENT_LIST,
  IpcChannels.ASSIGNMENT_GET,
  IpcChannels.ASSIGNMENT_CREATE,
  IpcChannels.ASSIGNMENT_UPDATE,
  IpcChannels.ASSIGNMENT_DELETE,
  IpcChannels.ASSIGNMENT_LIST_SUBMISSIONS,
  IpcChannels.ASSIGNMENT_GRADE_SUBMISSION,
  IpcChannels.ASSIGNMENT_PICK_ATTACHMENT,
  IpcChannels.ASSIGNMENT_OPEN_ATTACHMENT,
]);

// County (CEO) portal reads — county-wide aggregates that no other role's
// screens use.
export const COUNTY_ADMIN_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  IpcChannels.COUNTY_GET_DASHBOARD,
  IpcChannels.COUNTY_LIST_DISTRICTS,
  IpcChannels.COUNTY_GET_DISTRICT,
  IpcChannels.COUNTY_ASSIGN_DEO,
  IpcChannels.COUNTY_REMOVE_DEO,
  IpcChannels.COUNTY_LIST_SCHOOLS,
  IpcChannels.COUNTY_GET_SCHOOL,
  IpcChannels.COUNTY_GET_REGISTRATION_CONTEXT,
  IpcChannels.COUNTY_REGISTER_SCHOOLS,
  IpcChannels.COUNTY_RESUBMIT_SCHOOL_REGISTRATION,
  IpcChannels.COUNTY_DISCARD_SCHOOL_REGISTRATION,
  IpcChannels.COUNTY_GET_SCHOOL_REGISTRATIONS,
  IpcChannels.COUNTY_SETTLE_SCHOOL_REGISTRATIONS,
  IpcChannels.COUNTY_LIST_STUDENTS,
  IpcChannels.COUNTY_GET_STUDENT,
  IpcChannels.COUNTY_GET_STUDENT_RECORD,
  IpcChannels.COUNTY_LIST_GUARDIANS,
  IpcChannels.COUNTY_GET_GUARDIAN,
  IpcChannels.COUNTY_LIST_TEACHERS,
  IpcChannels.COUNTY_GET_TEACHER,
  IpcChannels.COUNTY_FINANCE_DASHBOARD,
  IpcChannels.COUNTY_FINANCE_SCHOOLS,
  IpcChannels.COUNTY_FINANCE_PAYMENTS,
  IpcChannels.COUNTY_FINANCE_FEE_RULES,
  IpcChannels.COUNTY_REPORT_OPTIONS,
  IpcChannels.COUNTY_REPORT_SCHOOLS,
  IpcChannels.COUNTY_ENROLLMENT_REPORT,
  IpcChannels.COUNTY_ATTENDANCE_REPORT,
  IpcChannels.COUNTY_ACADEMIC_REPORT,
  IpcChannels.COUNTY_STAFF_REPORT,
  IpcChannels.COUNTY_MESSAGING_OVERVIEW,
  IpcChannels.COUNTY_MESSAGING_MESSAGES,
  IpcChannels.COUNTY_MESSAGING_START,
  IpcChannels.COUNTY_MESSAGING_SEND,
  IpcChannels.COUNTY_MESSAGING_MARK_READ,
  IpcChannels.COUNTY_NOTIFICATIONS_LIST,
  IpcChannels.COUNTY_NOTIFICATIONS_MARK_READ,
  IpcChannels.COUNTY_NOTIFICATIONS_MARK_ALL_READ,
  IpcChannels.COUNTY_AUDIT_STATS,
  IpcChannels.COUNTY_AUDIT_LIST,
  IpcChannels.COUNTY_SETTINGS,
  IpcChannels.COUNTY_LIST_USERS,
  IpcChannels.COUNTY_GET_USER_OPTIONS,
  IpcChannels.COUNTY_SET_USER_ACTIVE,
  IpcChannels.COUNTY_ASSIGN_USER,
  IpcChannels.COUNTY_GET_ACTIVATION_LINK,
  IpcChannels.COUNTY_CREATE_USER,
  IpcChannels.COUNTY_BULK_CREATE_USERS,
]);

// Office staff follow the module classification of a channel. A session saved
// by an older build has no modules; that reads as an empty set.
function assertOfficeAccess(workspaces: WorkspaceManager, access: ChannelAccess): void {
  const user = workspaces.active.user;
  if (typeof access !== 'string') {
    if (access.some((module) => hasModule(user, module))) return;
    throw new ForbiddenError(
      `This account does not have access to ${schoolAccessLabel([...access])}.`,
    );
  }
  if (canUseSchoolAccess(user, access)) return;
  if (access === 'PRINCIPAL') {
    throw new ForbiddenError('This action is only available to the School Admin.');
  }
  // 'BASE' is open to every institution-scoped role, so only a module can refuse here.
  throw new ForbiddenError(`This account does not have access to ${schoolAccessLabel(access as SchoolModule)}.`);
}

export function authorizeChannel(channel: IpcChannel, workspaces: WorkspaceManager): void {
  if (PUBLIC_CHANNELS.has(channel)) return;
  let role: string;
  try {
    role = workspaces.active.user.role;
  } catch {
    throw new UnauthorizedError('Sign in to unlock an offline workspace.');
  }
  const schoolAdminAccess = SCHOOL_ADMIN_CHANNELS.get(channel);
  if (schoolAdminAccess !== undefined) {
    if (role === SystemRole.INSTITUTION_STAFF) {
      assertOfficeAccess(workspaces, schoolAdminAccess);
    } else if (role !== SystemRole.INSTITUTION_ADMIN) {
      throw new ForbiddenError('This action requires a school administrator workspace.');
    }
  }
  if (REPORT_CARD_CHANNELS.has(channel)) {
    if (role === SystemRole.INSTITUTION_STAFF) {
      // Access comes from the staff map so the two cannot drift.
      assertOfficeAccess(workspaces, SCHOOL_STAFF_CHANNELS.get(channel) ?? 'PRINCIPAL');
    } else if (role !== SystemRole.INSTITUTION_ADMIN && role !== SystemRole.TEACHER) {
      throw new ForbiddenError('Report cards are only available to school administrators and teachers.');
    }
  }
  const schoolStaffAccess = SCHOOL_STAFF_CHANNELS.get(channel);
  if (schoolStaffAccess !== undefined) {
    if (role === SystemRole.INSTITUTION_STAFF) {
      assertOfficeAccess(workspaces, schoolStaffAccess);
    } else if (role !== SystemRole.INSTITUTION_ADMIN && role !== SystemRole.TEACHER) {
      throw new ForbiddenError('Attendance is only available to school administrators and teachers.');
    }
  }
  if (TEACHER_ONLY_CHANNELS.has(channel) && role !== SystemRole.TEACHER) {
    throw new ForbiddenError('Assignments are only available to teachers.');
  }
  if (
    GOVERNMENT_YEAR_ARCHIVE_CHANNELS.has(channel) &&
    role !== SystemRole.DEO &&
    role !== SystemRole.COUNTY_ADMIN
  ) {
    throw new ForbiddenError('Year closures are only available to district and county officers.');
  }
  if (COUNTY_ADMIN_CHANNELS.has(channel) && role !== SystemRole.COUNTY_ADMIN) {
    throw new ForbiddenError('This view requires a county administrator workspace.');
  }
  // Every other channel (identity, device, settings, sync, generic
  // schoolAdmin records, and TEACHER_GET_DASHBOARD) stays open to any
  // authenticated role — they're either genuinely cross-portal or, in
  // TEACHER_GET_DASHBOARD's case, legitimately used by both the teacher
  // portal and the school-admin dashboard's teacher-list widget.
}
