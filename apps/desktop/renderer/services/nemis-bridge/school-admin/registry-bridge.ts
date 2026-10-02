import type {
  IpcErrorCode,
  OnlineCommandResult,
  RegistryClaimRequest,
  RegistryClaimResult,
  RegistryLookupRequest,
  RegistryLookupResult,
  RegistryReleaseRequest,
  RegistryReleaseResult,
} from '@nemis-desktop/types';
import { parseIpcError } from '../../../lib/errors/parseIpcError';
import { api } from '../api';

export const registryBridge = {
  lookupStudent: (request: RegistryLookupRequest): Promise<RegistryLookupResult> =>
    api().registry.lookup(request),
  claimStudent: (request: RegistryClaimRequest): Promise<OnlineCommandResult<RegistryClaimResult>> =>
    api().registry.claim(request),
  requestRelease: (request: RegistryReleaseRequest): Promise<OnlineCommandResult<RegistryReleaseResult>> =>
    api().registry.request(request),
};

/** preload/invoke.ts throws `[CODE] message`; online screens branch on the
 * code (OFFLINE disables, RATE_LIMITED waits, REMOTE_REJECTED shows the
 * server's text). Anything unrecognised is null. */
export function parseIpcErrorCode(error: unknown): IpcErrorCode | null {
  return parseIpcError(error)?.code ?? null;
}

export { parseIpcError };
