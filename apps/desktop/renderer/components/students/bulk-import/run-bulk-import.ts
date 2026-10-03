import type {
  BulkClaimRequest,
  BulkClaimResult,
  CreateAndEnrollStudentRequest,
  Gender,
  GradeLevel,
  OnlineCommandResult,
} from '@nemis-desktop/types';
import { parseIpcError } from '../../../lib/errors/parseIpcError';
import {
  allToRetry,
  mapClaimOutcome,
  partitionRows,
  splitClaimBatch,
  toBulkClaimRows,
  type BulkRow,
  type IndexedRow,
  type RetryEntry,
} from './bulk-import-logic';

export const OFFLINE_RETRY_REASON = 'Needs a connection — import these rows again when online. Keep the NEMIS IDs.';
export const TOO_MANY_CLAIM_ROWS_REASON = 'Too many NEMIS-ID rows in one import — import these rows again.';
export const CLAIM_CALL_FAILED_REASON = 'The import could not reach the server. Import these rows again.';
export const LOCAL_CREATE_FAILED = 'Could not create student record.';

/** Structurally the presentation layer's CommandOutcome: a failure carries a
 * PresentationError whose `cause` is the `[CODE] message` IPC error. */
export type CreateAndEnrollFn = (
  request: CreateAndEnrollStudentRequest,
) => Promise<{ ok: true; data: { nemisId?: string | null } } | { ok: false; error: Error }>;

export type BulkClaimFn = (request: BulkClaimRequest) => Promise<OnlineCommandResult<BulkClaimResult>>;

export interface BulkImportOutcome {
  /** Valid rows that entered the import (local + claim + grade mismatches). */
  submitted: number;
  created: { originalIndex: number; nemisId: string }[];
  claimed: { originalIndex: number; nemisId: string }[];
  failed: { originalIndex: number; error: string }[];
  retry: RetryEntry[];
  registryUnavailableMessage: string | null;
  /** The claim call succeeded but the post-command refresh did not run. */
  pendingSync: boolean;
}

function toCreateRequest(
  { row }: IndexedRow,
  institutionId: string,
  target: { academicYearId: string; classId: string; termId: string },
): CreateAndEnrollStudentRequest {
  return {
    institutionId,
    firstName: row.firstName.trim(),
    lastName: row.lastName.trim(),
    dateOfBirth: row.dateOfBirth.trim(),
    gender: row.gender.toUpperCase() as Gender,
    gradeLevel: row.gradeLevel.toUpperCase() as GradeLevel,
    email: row.studentEmail.trim() || undefined,
    academicYearId: target.academicYearId,
    classId: target.classId,
    termId: target.termId,
    enrollmentDate: row.admissionDate.trim(),
    // A spreadsheet row with no ID asserts nothing (as on portal-web).
    assertedNoNemisId: false,
    guardians: [
      {
        firstName: row.guardianFirstName.trim(),
        lastName: row.guardianLastName.trim(),
        relationship: row.guardianRelationship.trim(),
        phoneNumber: row.guardianPhone.trim(),
        isPrimary: true,
      },
    ],
  };
}

/** Local rows first (offline-capable, one at a time so each failure is
 * attributed to its own row), then every NEMIS-ID row in ONE claim call. A
 * claim-call failure never undoes the local creates already done. */
export async function runBulkImport(input: {
  rows: BulkRow[];
  gradeLevel: GradeLevel;
  institutionId: string;
  target: { academicYearId: string; classId: string; termId: string };
  online: boolean;
  createAndEnroll: CreateAndEnrollFn;
  bulkClaim: BulkClaimFn;
}): Promise<BulkImportOutcome> {
  const { local, claim, failed: mismatched } = partitionRows(input.rows, input.gradeLevel);
  const created: BulkImportOutcome['created'] = [];
  const failed: BulkImportOutcome['failed'] = [...mismatched];
  let claimed: BulkImportOutcome['claimed'] = [];
  let retry: RetryEntry[] = [];
  let registryUnavailableMessage: string | null = null;
  let pendingSync = false;

  for (const entry of local) {
    try {
      const outcome = await input.createAndEnroll(toCreateRequest(entry, input.institutionId, input.target));
      if (outcome.ok) {
        // A fresh local student always has a nemisId; the fallback only
        // satisfies the type checker.
        created.push({ originalIndex: entry.originalIndex, nemisId: outcome.data.nemisId ?? '' });
      } else {
        failed.push({
          originalIndex: entry.originalIndex,
          error: parseIpcError(outcome.error.cause)?.message ?? LOCAL_CREATE_FAILED,
        });
      }
    } catch (cause) {
      failed.push({ originalIndex: entry.originalIndex, error: parseIpcError(cause)?.message ?? LOCAL_CREATE_FAILED });
    }
  }

  if (claim.length > 0 && !input.online) {
    retry = allToRetry(claim, OFFLINE_RETRY_REASON);
  } else if (claim.length > 0) {
    const { send, overflow } = splitClaimBatch(claim);
    try {
      const result = await input.bulkClaim({
        classId: input.target.classId,
        academicYearId: input.target.academicYearId,
        termId: input.target.termId,
        students: toBulkClaimRows(send),
      });
      const mapped = mapClaimOutcome(send, result.data);
      claimed = mapped.claimed;
      retry = mapped.retry;
      registryUnavailableMessage = result.data.registryUnavailableMessage;
      pendingSync = !result.refreshed;
    } catch (cause) {
      retry = allToRetry(send, parseIpcError(cause)?.message ?? CLAIM_CALL_FAILED_REASON);
    }
    retry = [...retry, ...allToRetry(overflow, TOO_MANY_CLAIM_ROWS_REASON)];
  }

  failed.sort((a, b) => a.originalIndex - b.originalIndex);
  return {
    submitted: local.length + claim.length + mismatched.length,
    created,
    claimed,
    failed,
    retry,
    registryUnavailableMessage,
    pendingSync,
  };
}
