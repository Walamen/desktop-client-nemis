import type { Gender, GradeLevel } from './enums';
import type { ReportCardPayloadV1 } from './report-cards';
import type { TransferMatchingRows } from './transfer-carry-over';

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

/** Name-based lookup: the same endpoint, a different body. Online only. */
export interface RegistryNameLookupRequest {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD. */
  dateOfBirth: string;
}

/** One candidate of a name search. The full NEMIS ID is needed to continue;
 * the screen shows it masked until the admin chooses the match. */
export interface RegistryNameMatch {
  nemisId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  schoolName: string;
}

export type RegistryNameLookupResult =
  | { found: false }
  | { found: true; matches: RegistryNameMatch[]; truncated: boolean };

export interface RegistryLastCompletion {
  gradeLevel: GradeLevel;
  outcome: 'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'WITHDRAWN';
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
  /** ALREADY_ENROLLED: the child is live at the caller's own school. */
  claimPath: 'IMMEDIATE' | 'REQUIRES_APPROVAL' | 'ALREADY_ENROLLED';
  /** The grade the child may enter without an override reason; null when
   * there is none (graduated, or no FINAL card). */
  eligibleGradeLevel: GradeLevel | null;
  /** The latest current FINAL report card, if any. */
  finalCard: { payload: ReportCardPayloadV1; version: number } | null;
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
  /** The class this row is enrolled in. Needs a server with per-row classes. */
  classId: string;
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
  academicYearId: string;
  termId: string;
  /** 1..500; each row names its own class. */
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
  /** Approve with the prior record matched (the receiving school's decision). */
  matching?: TransferMatchingRows;
}

/** A review's reply: whether the origin's record came over with the approval. */
export interface TransferReviewResult {
  id: string;
  recordBroughtOver: boolean;
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
