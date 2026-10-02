import type { GradeLevel } from './enums';

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
  gender: 'MALE' | 'FEMALE';
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

export interface RemoteRecordRef {
  id: string;
}

export interface RegistryClaimResult {
  studentId: string;
}
