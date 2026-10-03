import type { Gender, GradeLevel } from './enums';

/** Shapes mirror Nemis/apps/server/src/student-registry/dto/*.ts,
 * Nemis/apps/server/src/student-transfers/dto/*.ts and the client type in
 * Nemis/apps/portal-web/src/store/school-admin/Api/studentRegistryApi.ts.
 * The desktop cannot import across repos, so changes there must be mirrored here. */

export interface RegistryLookupRequest {
  /** 12 bare digits. */
  nemisId: string;
  /** YYYY-MM-DD. */
  dateOfBirth: string;
}

export interface RegistryLastCompletion {
  gradeLevel: GradeLevel;
  outcome: 'PROMOTED' | 'RETAINED' | 'GRADUATED';
  /** Null for GRADUATED — there is nothing to pre-fill. */
  nextGradeLevel: GradeLevel | null;
  academicYearName: string;
}

export interface RegistryHit {
  found: true;
  nemisId: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  lastCompletion: RegistryLastCompletion | null;
  claimPath: 'IMMEDIATE' | 'REQUIRES_APPROVAL';
}

/** A miss is uniform: a wrong ID and a wrong birth date are indistinguishable. */
export type RegistryLookupResult = { found: false } | RegistryHit;

export interface RegistryClaimRequest {
  nemisId: string;
  dateOfBirth: string;
  classId: string;
  termId: string;
  gradeLevel: GradeLevel;
  /** Required by the server when gradeLevel differs from the stamp. */
  overrideReason?: string;
}

/** One bulk-import row that carries a NEMIS ID. Mirrors the server's
 * POST /students/bulk row DTO. */
export interface BulkClaimRow {
  /** Canonical 12 digits. */
  nemisId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: Gender;
  gradeLevel: GradeLevel;
  admissionDate?: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianRelationship?: string;
  studentEmail?: string;
}

export interface BulkClaimRequest {
  classId: string;
  academicYearId: string;
  termId: string;
  /** 1..500. */
  students: BulkClaimRow[];
}

/** Credentials the server returns for created rows are deliberately dropped. */
export interface BulkClaimResult {
  /** `index` is the position in `request.students`. */
  created: { index: number; nemisId: string }[];
  failed: { index: number; error: string }[];
  /** Present only when the server stopped early. Shown verbatim. */
  registryUnavailableMessage: string | null;
}

export interface RegistryReleaseRequest {
  nemisId: string;
  dateOfBirth: string;
  classId: string;
  termId: string;
  gradeLevel: GradeLevel;
  reason: string;
}

export interface TransferCreateRequest {
  studentId: string;
  toInstitutionId: string;
  reason: string;
  requestedDate?: string;
  toGradeLevel?: GradeLevel;
}

export interface TransferReviewRequest {
  id: string;
  status: 'APPROVED' | 'REJECTED';
  reviewNotes?: string;
  classId?: string;
  termId?: string;
}

/** Every online mutation reports whether the post-command pull ran. When
 * `refreshed` is false the server change happened but local data has not
 * caught up yet — the UI says so instead of offering a retry. */
export interface OnlineCommandResult<T> {
  data: T;
  refreshed: boolean;
}

/** A release request's id and the date it lapses (14 days, server-set) —
 * shown in the wizard's waiting state; never written locally (D5). */
export interface RegistryReleaseResult {
  id: string;
  lapsesAt: string | null;
}

export interface SchoolSearchResult {
  id: string;
  name: string;
  code: string;
}

export interface RemoteRecordRef {
  id: string;
}

export interface RegistryClaimResult {
  studentId: string;
}
