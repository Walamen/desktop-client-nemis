import { IPCError } from '@nemis-desktop/shared';
import {
  AcademicYearStatus,
  AssignmentStatus,
  AssignmentType,
  AttendanceStatus,
  DayOfWeek,
  EmploymentType,
  EnrollmentStatus,
  Gender,
  GradeLevel,
  SCHOOL_ADMIN_COLLECTIONS,
  StaffPosition,
} from '@nemis-desktop/types';

/** Rejects IPC calls that pass unexpected arguments. Never trust renderer input. */
export function assertNoArgs(args: readonly unknown[]): void {
  if (args.length > 0) {
    throw new IPCError(`Expected no arguments, received ${args.length}.`);
  }
}

const MAX_SETTING_KEY_LENGTH = 128;

/** Exactly one bounded, non-empty string argument: an app-settings key. */
export function assertSettingKeyArg(args: readonly unknown[]): void {
  if (args.length !== 1) {
    throw new IPCError(`Expected exactly 1 argument, received ${args.length}.`);
  }
  const [key] = args;
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_SETTING_KEY_LENGTH) {
    throw new IPCError(
      `Expected a non-empty string key (max ${MAX_SETTING_KEY_LENGTH} characters).`,
    );
  }
}

// --- Academic Foundation (Phase 9) --------------------------------------
//
// Shared bounded-shape primitives. Every validator below enforces exact
// arity, exact argument shape, and rejects unknown extra keys — the
// renderer's input is never trusted past this point.

const ID_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 200;
const CODE_MAX_LENGTH = 32;
const DESCRIPTION_MAX_LENGTH = 2000;
const KEYWORD_MAX_LENGTH = 200;
const MAX_LIMIT = 100;
const EMAIL_MAX_LENGTH = 320;
const PASSWORD_MAX_LENGTH = 1024;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const CLASS_SORT_KEYS = ['name', 'gradeLevel', 'updatedAt'] as const;
const SUBJECT_SORT_KEYS = ['name', 'code', 'updatedAt'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertArity(args: readonly unknown[], count: number): void {
  if (args.length !== count) {
    throw new IPCError(`Expected exactly ${count} argument(s), received ${args.length}.`);
  }
}

function assertKnownKeys(obj: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new IPCError(`Unexpected field "${key}".`);
    }
  }
}

function assertString(value: unknown, field: string, maxLength: number): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new IPCError(`Expected a non-empty string for "${field}" (max ${maxLength} characters).`);
  }
}

function assertOptionalString(value: unknown, field: string, maxLength: number): void {
  if (value === undefined) return;
  assertString(value, field, maxLength);
}

/** A nullable optional string field (update DTOs use `null` to clear a value). */
function assertOptionalNullableString(value: unknown, field: string, maxLength: number): void {
  if (value === undefined || value === null) return;
  assertString(value, field, maxLength);
}

function assertOptionalBoolean(value: unknown, field: string): void {
  if (value === undefined) return;
  if (typeof value !== 'boolean') {
    throw new IPCError(`Expected a boolean for "${field}".`);
  }
}

function assertBoolean(value: unknown, field: string): void {
  if (typeof value !== 'boolean') {
    throw new IPCError(`Expected a boolean for "${field}".`);
  }
}

function assertIsoDate(value: unknown, field: string): void {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw new IPCError(`Expected an ISO-8601 date string for "${field}".`);
  }
}

function assertOptionalIsoDate(value: unknown, field: string): void {
  if (value === undefined) return;
  assertIsoDate(value, field);
}

function assertEnumMember(value: unknown, field: string, allowed: readonly string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new IPCError(`Expected "${field}" to be one of: ${allowed.join(', ')}.`);
  }
}

function assertOptionalEnumMember(value: unknown, field: string, allowed: readonly string[]): void {
  if (value === undefined) return;
  assertEnumMember(value, field, allowed);
}

/** capacity: undefined (unchanged) | null (clear) | positive bounded integer. */
function assertOptionalNullableCapacity(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1000) {
    throw new IPCError('Expected "capacity" to be an integer between 1 and 1000.');
  }
}

function assertOptionalInt(value: unknown, field: string, min: number, max: number): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new IPCError(`Expected "${field}" to be an integer between ${min} and ${max}.`);
  }
}

/** Exactly one bounded, non-empty string argument: a domain entity id. */
export function assertSingleIdArg(args: readonly unknown[]): void {
  assertArity(args, 1);
  assertString(args[0], 'id', ID_MAX_LENGTH);
}

// --- Student Management (Phase 10) --------------------------------------
export function assertListStudentsArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, [
    'limit',
    'offset',
    'keyword',
    'gender',
    'gradeLevel',
    'classId',
    'academicYearId',
    'enrollmentStatus',
    'isActive',
    'sort',
  ]);
  assertOptionalInt(r.limit, 'limit', 1, 100);
  assertOptionalInt(r.offset, 'offset', 0, 1_000_000);
  assertOptionalString(r.keyword, 'keyword', KEYWORD_MAX_LENGTH);
  assertOptionalEnumMember(r.gender, 'gender', Object.values(Gender));
  assertOptionalEnumMember(r.gradeLevel, 'gradeLevel', Object.values(GradeLevel));
  assertOptionalString(r.classId, 'classId', ID_MAX_LENGTH);
  assertOptionalString(r.academicYearId, 'academicYearId', ID_MAX_LENGTH);
  assertOptionalEnumMember(r.enrollmentStatus, 'enrollmentStatus', Object.values(EnrollmentStatus));
  assertOptionalBoolean(r.isActive, 'isActive');
  if (r.sort !== undefined)
    assertEnumMember(r.sort, 'sort', ['name', 'admissionNumber', 'updatedAt']);
}
export function assertCreateStudentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, [
    'institutionId',
    'firstName',
    'middleName',
    'lastName',
    'admissionNumber',
    'admissionDate',
    'dateOfBirth',
    'gender',
    'gradeLevel',
    'phoneNumber',
    'email',
    'address',
  ]);
  for (const k of ['institutionId', 'firstName', 'lastName', 'admissionNumber'] as const)
    assertString(r[k], k, NAME_MAX_LENGTH);
  assertIsoDate(r.dateOfBirth, 'dateOfBirth');
  assertOptionalIsoDate(r.admissionDate, 'admissionDate');
  assertEnumMember(r.gender, 'gender', Object.values(Gender));
  assertOptionalEnumMember(r.gradeLevel, 'gradeLevel', Object.values(GradeLevel));
  for (const k of ['middleName', 'phoneNumber', 'email', 'address'] as const)
    assertOptionalString(r[k], k, k === 'address' ? 2000 : NAME_MAX_LENGTH);
}
export function assertUpdateStudentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, [
    'studentId',
    'firstName',
    'middleName',
    'lastName',
    'dateOfBirth',
    'gender',
    'gradeLevel',
    'phoneNumber',
    'email',
    'address',
  ]);
  assertString(r.studentId, 'studentId', ID_MAX_LENGTH);
  for (const k of [
    'firstName',
    'middleName',
    'lastName',
    'phoneNumber',
    'email',
    'address',
  ] as const)
    assertOptionalString(r[k], k, k === 'address' ? 2000 : NAME_MAX_LENGTH);
  assertOptionalIsoDate(r.dateOfBirth, 'dateOfBirth');
  assertOptionalEnumMember(r.gender, 'gender', Object.values(Gender));
  assertOptionalEnumMember(r.gradeLevel, 'gradeLevel', Object.values(GradeLevel));
}
export function assertSetStudentActiveArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, ['studentId', 'isActive']);
  assertString(r.studentId, 'studentId', ID_MAX_LENGTH);
  assertBoolean(r.isActive, 'isActive');
}
export function assertCreateGuardianArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, [
    'studentId',
    'firstName',
    'lastName',
    'relationship',
    'phoneNumber',
    'email',
    'isPrimary',
  ]);
  for (const k of ['studentId', 'firstName', 'lastName', 'relationship', 'phoneNumber'] as const)
    assertString(r[k], k, NAME_MAX_LENGTH);
  assertOptionalString(r.email, 'email', NAME_MAX_LENGTH);
  assertBoolean(r.isPrimary, 'isPrimary');
}
export function assertEnrollStudentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, ['studentId', 'classId', 'academicYearId', 'termId', 'enrollmentDate']);
  for (const k of ['studentId', 'classId', 'academicYearId', 'termId'] as const)
    assertString(r[k], k, ID_MAX_LENGTH);
  assertOptionalIsoDate(r.enrollmentDate, 'enrollmentDate');
}
export function assertMoveEnrollmentClassArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['enrollmentId', 'targetClassId']);
  assertString(request.enrollmentId, 'enrollmentId', ID_MAX_LENGTH);
  assertString(request.targetClassId, 'targetClassId', ID_MAX_LENGTH);
}

export function assertAuthenticateArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['email', 'password']);
  assertString(request.email, 'email', EMAIL_MAX_LENGTH);
  assertString(request.password, 'password', PASSWORD_MAX_LENGTH);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email as string)) {
    throw new IPCError('Expected a valid email address.');
  }
}

// --- Teacher Management (Phase 11) -------------------------------------
const TEACHER_FIELDS = [
  'institutionId',
  'firstName',
  'middleName',
  'lastName',
  'dateOfBirth',
  'gender',
  'nationalId',
  'phoneNumber',
  'email',
  'address',
  'employeeNumber',
  'position',
  'employmentType',
  'dateOfJoining',
  'qualifications',
  'photoUrl',
] as const;
export function assertListTeachersArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, [
    'limit',
    'offset',
    'keyword',
    'employmentType',
    'position',
    'isActive',
    'subjectId',
    'gradeLevel',
    'classId',
    'academicYearId',
    'sort',
  ]);
  assertOptionalInt(r.limit, 'limit', 1, MAX_LIMIT);
  assertOptionalInt(r.offset, 'offset', 0, 1_000_000);
  assertOptionalString(r.keyword, 'keyword', KEYWORD_MAX_LENGTH);
  assertOptionalEnumMember(r.employmentType, 'employmentType', Object.values(EmploymentType));
  assertOptionalEnumMember(r.position, 'position', Object.values(StaffPosition));
  assertOptionalBoolean(r.isActive, 'isActive');
  for (const k of ['subjectId', 'classId', 'academicYearId'] as const)
    assertOptionalString(r[k], k, ID_MAX_LENGTH);
  assertOptionalEnumMember(r.gradeLevel, 'gradeLevel', Object.values(GradeLevel));
  assertOptionalEnumMember(r.sort, 'sort', [
    'name',
    'employeeNumber',
    'dateOfJoining',
    'updatedAt',
  ]);
}
export function assertCreateTeacherArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, TEACHER_FIELDS);
  for (const k of [
    'institutionId',
    'firstName',
    'lastName',
    'phoneNumber',
    'employeeNumber',
  ] as const)
    assertString(r[k], k, NAME_MAX_LENGTH);
  assertIsoDate(r.dateOfBirth, 'dateOfBirth');
  assertIsoDate(r.dateOfJoining, 'dateOfJoining');
  assertEnumMember(r.gender, 'gender', Object.values(Gender));
  assertEnumMember(r.position, 'position', Object.values(StaffPosition));
  assertEnumMember(r.employmentType, 'employmentType', Object.values(EmploymentType));
  for (const k of ['middleName', 'nationalId', 'email', 'address', 'photoUrl'] as const)
    assertOptionalString(r[k], k, k === 'address' ? DESCRIPTION_MAX_LENGTH : NAME_MAX_LENGTH);
  if (r.qualifications !== undefined && !isPlainObject(r.qualifications))
    throw new IPCError('Expected "qualifications" to be an object.');
}
export function assertUpdateTeacherArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, ['teacherId', ...TEACHER_FIELDS.filter((k) => k !== 'institutionId')]);
  assertString(r.teacherId, 'teacherId', ID_MAX_LENGTH);
  for (const k of [
    'firstName',
    'middleName',
    'lastName',
    'nationalId',
    'phoneNumber',
    'email',
    'address',
    'employeeNumber',
    'photoUrl',
  ] as const)
    assertOptionalString(r[k], k, k === 'address' ? DESCRIPTION_MAX_LENGTH : NAME_MAX_LENGTH);
  assertOptionalIsoDate(r.dateOfBirth, 'dateOfBirth');
  assertOptionalIsoDate(r.dateOfJoining, 'dateOfJoining');
  assertOptionalEnumMember(r.gender, 'gender', Object.values(Gender));
  assertOptionalEnumMember(r.position, 'position', Object.values(StaffPosition));
  assertOptionalEnumMember(r.employmentType, 'employmentType', Object.values(EmploymentType));
  if (r.qualifications !== undefined && !isPlainObject(r.qualifications))
    throw new IPCError('Expected "qualifications" to be an object.');
}
export function assertSetTeacherActiveArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, ['teacherId', 'isActive']);
  assertString(r.teacherId, 'teacherId', ID_MAX_LENGTH);
  assertBoolean(r.isActive, 'isActive');
}
export function assertAssignTeacherArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, ['teacherId', 'classId', 'subjectId', 'isClassTeacher']);
  assertString(r.teacherId, 'teacherId', ID_MAX_LENGTH);
  assertString(r.classId, 'classId', ID_MAX_LENGTH);
  assertString(r.subjectId, 'subjectId', ID_MAX_LENGTH);
  assertOptionalBoolean(r.isClassTeacher, 'isClassTeacher');
}
export function assertUpdateTeachingAssignmentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, ['assignmentId', 'subjectId', 'isClassTeacher']);
  assertString(r.assignmentId, 'assignmentId', ID_MAX_LENGTH);
  assertOptionalString(r.subjectId, 'subjectId', ID_MAX_LENGTH);
  assertOptionalBoolean(r.isClassTeacher, 'isClassTeacher');
}
export function assertRemoveTeachingAssignmentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, ['assignmentId']);
  assertString(r.assignmentId, 'assignmentId', ID_MAX_LENGTH);
}

// --- Timetable Management (Phase 13) -----------------------------------
const TIMETABLE_FIELDS = [
  'institutionId',
  'classId',
  'subjectId',
  'staffId',
  'assignmentId',
  'dayOfWeek',
  'startTime',
  'endTime',
  'room',
  'isBreak',
] as const;
function assertTime(value: unknown, name: string): void {
  assertString(value, name, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value as string))
    throw new IPCError(`Expected "${name}" in HH:MM format.`);
}
function assertTimetableEntry(r: Record<string, unknown>, update = false): void {
  assertKnownKeys(
    r,
    update ? ['id', ...TIMETABLE_FIELDS.filter((k) => k !== 'institutionId')] : TIMETABLE_FIELDS,
  );
  if (update) assertString(r.id, 'id', ID_MAX_LENGTH);
  else assertString(r.institutionId, 'institutionId', ID_MAX_LENGTH);
  if (update) assertOptionalString(r.classId, 'classId', ID_MAX_LENGTH);
  else assertString(r.classId, 'classId', ID_MAX_LENGTH);
  for (const k of ['subjectId', 'staffId', 'assignmentId'] as const)
    assertOptionalString(r[k], k, ID_MAX_LENGTH);
  if (update) assertOptionalEnumMember(r.dayOfWeek, 'dayOfWeek', Object.values(DayOfWeek));
  else assertEnumMember(r.dayOfWeek, 'dayOfWeek', Object.values(DayOfWeek));
  if (update) {
    if (r.startTime !== undefined) assertTime(r.startTime, 'startTime');
    if (r.endTime !== undefined) assertTime(r.endTime, 'endTime');
  } else {
    assertTime(r.startTime, 'startTime');
    assertTime(r.endTime, 'endTime');
  }
  assertOptionalString(r.room, 'room', NAME_MAX_LENGTH);
  assertOptionalBoolean(r.isBreak, 'isBreak');
}
export function assertListTimetablesArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, [
    'limit',
    'offset',
    'keyword',
    'academicYearId',
    'classId',
    'teacherId',
    'subjectId',
    'gradeLevel',
    'dayOfWeek',
    'sort',
  ]);
  assertOptionalInt(r.limit, 'limit', 1, MAX_LIMIT);
  assertOptionalInt(r.offset, 'offset', 0, 1_000_000);
  assertOptionalString(r.keyword, 'keyword', KEYWORD_MAX_LENGTH);
  for (const k of ['academicYearId', 'classId', 'teacherId', 'subjectId'] as const)
    assertOptionalString(r[k], k, ID_MAX_LENGTH);
  assertOptionalEnumMember(r.gradeLevel, 'gradeLevel', Object.values(GradeLevel));
  assertOptionalEnumMember(r.dayOfWeek, 'dayOfWeek', Object.values(DayOfWeek));
  assertOptionalEnumMember(r.sort, 'sort', [
    'day',
    'time',
    'class',
    'teacher',
    'subject',
    'updatedAt',
  ]);
}
export function assertCreateTimetableArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertTimetableEntry(r);
}
export function assertUpdateTimetableArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertTimetableEntry(r, true);
}
export function assertCopyTimetableArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, ['sourceClassId', 'targetClassId']);
  assertString(r.sourceClassId, 'sourceClassId', ID_MAX_LENGTH);
  assertString(r.targetClassId, 'targetClassId', ID_MAX_LENGTH);
}
export function assertValidateTimetableArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [r] = args;
  if (!isPlainObject(r)) throw new IPCError('Expected a request object.');
  assertKnownKeys(r, ['entry', 'excludeId']);
  if (!isPlainObject(r.entry)) throw new IPCError('Expected "entry" to be an object.');
  assertTimetableEntry(r.entry);
  assertOptionalString(r.excludeId, 'excludeId', ID_MAX_LENGTH);
}
export function assertOptionalIdArgs(args: readonly unknown[]): void {
  if (args.length === 0) return;
  if (args.length !== 1) throw new IPCError('Expected zero or one argument.');
  if (args[0] !== undefined) assertString(args[0], 'id', ID_MAX_LENGTH);
}
export function assertDayOfWeekArg(args: readonly unknown[]): void {
  assertArity(args, 1);
  assertEnumMember(args[0], 'dayOfWeek', Object.values(DayOfWeek));
}

export function assertSchoolAdminListArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const request = args[0];
  if (!isPlainObject(request)) throw new IPCError('Expected a school-admin list request.');
  assertKnownKeys(request, ['collection', 'limit', 'offset']);
  assertSchoolAdminCollection(request.collection);
  for (const key of ['limit', 'offset'] as const) {
    const value = request[key];
    if (
      value !== undefined &&
      (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 10000)
    ) {
      throw new IPCError(`Expected a bounded non-negative integer for "${key}".`);
    }
  }
}

export function assertSchoolAdminSaveArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const request = args[0];
  if (!isPlainObject(request)) throw new IPCError('Expected a school-admin save request.');
  assertKnownKeys(request, ['collection', 'record']);
  assertSchoolAdminCollection(request.collection);
  if (!isPlainObject(request.record) || Object.keys(request.record).length > 40) {
    throw new IPCError('Expected a bounded school-admin record.');
  }
  for (const [key, value] of Object.entries(request.record)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) throw new IPCError(`Invalid record field "${key}".`);
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new IPCError(`Invalid scalar value for "${key}".`);
    }
    if (typeof value === 'string' && value.length > 100_000) {
      throw new IPCError(`Value for "${key}" is too large.`);
    }
  }
}

export function assertSchoolAdminDeleteArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const request = args[0];
  if (!isPlainObject(request)) throw new IPCError('Expected a school-admin delete request.');
  assertKnownKeys(request, ['collection', 'id']);
  assertSchoolAdminCollection(request.collection);
  assertString(request.id, 'id', ID_MAX_LENGTH);
}

function assertSchoolAdminCollection(value: unknown): void {
  if (
    typeof value !== 'string' ||
    !(SCHOOL_ADMIN_COLLECTIONS as readonly string[]).includes(value)
  ) {
    throw new IPCError('Unknown school-admin collection.');
  }
}

export function assertResolveSyncConflictArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['conflictId', 'resolution']);
  assertString(request.conflictId, 'conflictId', ID_MAX_LENGTH);
  assertEnumMember(request.resolution, 'resolution', ['keep_local', 'accept_remote', 'retry']);
}

export function assertAttendanceListArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['classId', 'date', 'subjectId']);
  assertString(request.classId, 'classId', ID_MAX_LENGTH);
  assertIsoDate(request.date, 'date');
  assertOptionalString(request.subjectId, 'subjectId', ID_MAX_LENGTH);
}

export function assertRecordAttendanceArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, [
    'studentId', 'classId', 'subjectId', 'date', 'status', 'recordedBy', 'remarks', 'updateReason',
  ]);
  assertString(request.studentId, 'studentId', ID_MAX_LENGTH);
  assertString(request.classId, 'classId', ID_MAX_LENGTH);
  assertOptionalString(request.subjectId, 'subjectId', ID_MAX_LENGTH);
  assertIsoDate(request.date, 'date');
  assertEnumMember(request.status, 'status', Object.values(AttendanceStatus));
  assertOptionalString(request.recordedBy, 'recordedBy', ID_MAX_LENGTH);
  assertOptionalString(request.remarks, 'remarks', DESCRIPTION_MAX_LENGTH);
  assertOptionalString(request.updateReason, 'updateReason', DESCRIPTION_MAX_LENGTH);
}

export function assertCreateAcademicYearArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['code', 'startDate', 'endDate', 'makeCurrent']);
  assertString(request.code, 'code', NAME_MAX_LENGTH);
  assertIsoDate(request.startDate, 'startDate');
  assertIsoDate(request.endDate, 'endDate');
  assertOptionalBoolean(request.makeCurrent, 'makeCurrent');
}

export function assertUpdateAcademicYearArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['id', 'code', 'startDate', 'endDate']);
  assertString(request.id, 'id', ID_MAX_LENGTH);
  assertOptionalString(request.code, 'code', NAME_MAX_LENGTH);
  assertOptionalIsoDate(request.startDate, 'startDate');
  assertOptionalIsoDate(request.endDate, 'endDate');
}

export function assertSetAcademicYearStatusArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['id', 'status']);
  assertString(request.id, 'id', ID_MAX_LENGTH);
  assertEnumMember(request.status, 'status', Object.values(AcademicYearStatus));
}

export function assertCreateTermArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['academicYearId', 'name', 'startDate', 'endDate', 'makeCurrent']);
  assertString(request.academicYearId, 'academicYearId', ID_MAX_LENGTH);
  assertString(request.name, 'name', NAME_MAX_LENGTH);
  assertIsoDate(request.startDate, 'startDate');
  assertIsoDate(request.endDate, 'endDate');
  assertOptionalBoolean(request.makeCurrent, 'makeCurrent');
}

export function assertUpdateTermArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['id', 'name', 'startDate', 'endDate']);
  assertString(request.id, 'id', ID_MAX_LENGTH);
  assertOptionalString(request.name, 'name', NAME_MAX_LENGTH);
  assertOptionalIsoDate(request.startDate, 'startDate');
  assertOptionalIsoDate(request.endDate, 'endDate');
}

export function assertListClassesArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, [
    'limit',
    'offset',
    'keyword',
    'academicYearId',
    'gradeLevel',
    'includeInactive',
    'sort',
  ]);
  assertOptionalInt(request.limit, 'limit', 1, MAX_LIMIT);
  assertOptionalInt(request.offset, 'offset', 0, Number.MAX_SAFE_INTEGER);
  assertOptionalString(request.keyword, 'keyword', KEYWORD_MAX_LENGTH);
  assertOptionalString(request.academicYearId, 'academicYearId', ID_MAX_LENGTH);
  assertOptionalEnumMember(request.gradeLevel, 'gradeLevel', Object.values(GradeLevel));
  assertOptionalBoolean(request.includeInactive, 'includeInactive');
  assertOptionalEnumMember(request.sort, 'sort', CLASS_SORT_KEYS);
}

export function assertCreateClassArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['academicYearId', 'name', 'section', 'gradeLevel', 'capacity']);
  assertString(request.academicYearId, 'academicYearId', ID_MAX_LENGTH);
  assertString(request.name, 'name', NAME_MAX_LENGTH);
  assertOptionalString(request.section, 'section', NAME_MAX_LENGTH);
  assertEnumMember(request.gradeLevel, 'gradeLevel', Object.values(GradeLevel));
  assertOptionalInt(request.capacity, 'capacity', 1, 1000);
}

export function assertUpdateClassArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['id', 'name', 'section', 'gradeLevel', 'capacity']);
  assertString(request.id, 'id', ID_MAX_LENGTH);
  assertOptionalString(request.name, 'name', NAME_MAX_LENGTH);
  assertOptionalNullableString(request.section, 'section', NAME_MAX_LENGTH);
  assertOptionalEnumMember(request.gradeLevel, 'gradeLevel', Object.values(GradeLevel));
  assertOptionalNullableCapacity(request.capacity);
}

export function assertSetActiveArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['id', 'isActive']);
  assertString(request.id, 'id', ID_MAX_LENGTH);
  assertBoolean(request.isActive, 'isActive');
}

export function assertListSubjectsArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['limit', 'offset', 'keyword', 'includeInactive', 'sort']);
  assertOptionalInt(request.limit, 'limit', 1, MAX_LIMIT);
  assertOptionalInt(request.offset, 'offset', 0, Number.MAX_SAFE_INTEGER);
  assertOptionalString(request.keyword, 'keyword', KEYWORD_MAX_LENGTH);
  assertOptionalBoolean(request.includeInactive, 'includeInactive');
  assertOptionalEnumMember(request.sort, 'sort', SUBJECT_SORT_KEYS);
}

export function assertCreateSubjectArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['name', 'code', 'description']);
  assertString(request.name, 'name', NAME_MAX_LENGTH);
  assertString(request.code, 'code', CODE_MAX_LENGTH);
  assertOptionalString(request.description, 'description', DESCRIPTION_MAX_LENGTH);
}

export function assertUpdateSubjectArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['id', 'name', 'code', 'description']);
  assertString(request.id, 'id', ID_MAX_LENGTH);
  assertOptionalString(request.name, 'name', NAME_MAX_LENGTH);
  assertOptionalString(request.code, 'code', CODE_MAX_LENGTH);
  assertOptionalNullableString(request.description, 'description', DESCRIPTION_MAX_LENGTH);
}

export function assertClassSubjectPairArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['classId', 'subjectId']);
  assertString(request.classId, 'classId', ID_MAX_LENGTH);
  assertString(request.subjectId, 'subjectId', ID_MAX_LENGTH);
}

// --- Teacher Assignments -------------------------------------------------

function assertNonNegativeNumber(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new IPCError(`Expected "${field}" to be a number >= 0.`);
  }
}

function assertOptionalNonNegativeNumber(value: unknown, field: string): void {
  if (value === undefined) return;
  assertNonNegativeNumber(value, field);
}

export function assertListAssignmentsArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['classId', 'status']);
  assertOptionalString(request.classId, 'classId', ID_MAX_LENGTH);
  assertOptionalEnumMember(request.status, 'status', Object.values(AssignmentStatus));
}

export function assertCreateAssignmentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, [
    'classId', 'subjectId', 'title', 'type', 'status', 'instructions', 'dueDate', 'totalMarks',
    'attachmentFilePath',
  ]);
  assertString(request.classId, 'classId', ID_MAX_LENGTH);
  assertOptionalString(request.subjectId, 'subjectId', ID_MAX_LENGTH);
  assertString(request.title, 'title', NAME_MAX_LENGTH);
  assertEnumMember(request.type, 'type', Object.values(AssignmentType));
  // Only DRAFT/ACTIVE at creation — CLOSED is reached later via update.
  assertEnumMember(request.status, 'status', [AssignmentStatus.DRAFT, AssignmentStatus.ACTIVE]);
  assertOptionalString(request.instructions, 'instructions', DESCRIPTION_MAX_LENGTH);
  assertIsoDate(request.dueDate, 'dueDate');
  assertOptionalNonNegativeNumber(request.totalMarks, 'totalMarks');
  assertOptionalString(request.attachmentFilePath, 'attachmentFilePath', DESCRIPTION_MAX_LENGTH);
}

export function assertUpdateAssignmentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, [
    'id', 'title', 'subjectId', 'type', 'status', 'instructions', 'dueDate', 'totalMarks',
    'attachmentFilePath',
  ]);
  assertString(request.id, 'id', ID_MAX_LENGTH);
  assertOptionalString(request.title, 'title', NAME_MAX_LENGTH);
  assertOptionalString(request.subjectId, 'subjectId', ID_MAX_LENGTH);
  assertOptionalEnumMember(request.type, 'type', Object.values(AssignmentType));
  assertOptionalEnumMember(request.status, 'status', Object.values(AssignmentStatus));
  assertOptionalString(request.instructions, 'instructions', DESCRIPTION_MAX_LENGTH);
  assertOptionalIsoDate(request.dueDate, 'dueDate');
  assertOptionalNonNegativeNumber(request.totalMarks, 'totalMarks');
  assertOptionalString(request.attachmentFilePath, 'attachmentFilePath', DESCRIPTION_MAX_LENGTH);
}

/** A local `local-file://...` marker or a real https:// URL — either way,
 * just a bounded string; assignment:open-attachment decides which shell
 * method to use based on the prefix (see the handler, not this validator). */
export function assertOpenAttachmentArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  assertString(args[0], 'attachmentUrl', DESCRIPTION_MAX_LENGTH);
}

export function assertGradeSubmissionArgs(args: readonly unknown[]): void {
  assertArity(args, 1);
  const [request] = args;
  if (!isPlainObject(request)) throw new IPCError('Expected a request object.');
  assertKnownKeys(request, ['assignmentId', 'studentId', 'grade', 'feedback']);
  assertString(request.assignmentId, 'assignmentId', ID_MAX_LENGTH);
  assertString(request.studentId, 'studentId', ID_MAX_LENGTH);
  assertNonNegativeNumber(request.grade, 'grade');
  assertOptionalString(request.feedback, 'feedback', DESCRIPTION_MAX_LENGTH);
}
