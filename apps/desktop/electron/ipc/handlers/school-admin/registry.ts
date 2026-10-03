import {
  IpcChannels,
  type BulkClaimRequest,
  type RegistryClaimRequest,
  type RegistryLookupRequest,
  type RegistryReleaseRequest,
} from '@nemis-desktop/types';
import { normalizeNemisId } from '@nemis-desktop/shared';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertBulkClaimArgs,
  assertRegistryClaimArgs,
  assertRegistryLookupArgs,
  assertRegistryReleaseArgs,
} from '@app/security/validateIpc';
import { runOnline } from './online';

export type RegistryGateway = Pick<
  BackendProvisioningGateway,
  'lookupStudent' | 'claimStudent' | 'requestRelease' | 'bulkClaimStudents'
>;

/** The validator has already proven the ID normalises; this hands the server
 * the canonical 12 bare digits whatever separators the admin typed. */
function canonical<T extends { nemisId: string }>(request: T): T {
  return { ...request, nemisId: normalizeNemisId(request.nemisId) ?? request.nemisId };
}

function canonicalRows(request: BulkClaimRequest): BulkClaimRequest {
  return { ...request, students: request.students.map((row) => canonical(row)) };
}

export function registerRegistryHandlers(
  handle: IpcHandle,
  gateway: RegistryGateway,
  refresh: () => Promise<boolean>,
): void {
  // A lookup changes nothing on the server, so it never refreshes.
  handle(IpcChannels.REGISTRY_LOOKUP, assertRegistryLookupArgs, (request: RegistryLookupRequest) =>
    gateway.lookupStudent(canonical(request)),
  );
  handle(IpcChannels.REGISTRY_CLAIM, assertRegistryClaimArgs, (request: RegistryClaimRequest) =>
    runOnline(() => gateway.claimStudent(canonical(request)), refresh),
  );
  handle(IpcChannels.STUDENT_BULK_CLAIM, assertBulkClaimArgs, (request: BulkClaimRequest) =>
    runOnline(() => gateway.bulkClaimStudents(canonicalRows(request)), refresh),
  );
  handle(IpcChannels.REGISTRY_REQUEST, assertRegistryReleaseArgs, (request: RegistryReleaseRequest) =>
    runOnline(() => gateway.requestRelease(canonical(request)), refresh),
  );
}
