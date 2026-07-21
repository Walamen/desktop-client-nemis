import { IPCError } from '@nemis-desktop/shared';
import { AcademicYearStatus, GradeLevel } from '@nemis-desktop/types';

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
