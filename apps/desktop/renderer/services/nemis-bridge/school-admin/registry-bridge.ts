import type {
  IpcErrorCode,
  OnlineCommandResult,
  RegistryClaimRequest,
  RegistryClaimResult,
  RegistryLookupRequest,
  RegistryLookupResult,
  RegistryReleaseRequest,
  RemoteRecordRef,
} from '@nemis-desktop/types';
import { api } from '../api';

export const registryBridge = {
  lookupStudent: (request: RegistryLookupRequest): Promise<RegistryLookupResult> =>
    api().registry.lookup(request),
  claimStudent: (request: RegistryClaimRequest): Promise<OnlineCommandResult<RegistryClaimResult>> =>
    api().registry.claim(request),
  requestRelease: (request: RegistryReleaseRequest): Promise<OnlineCommandResult<RemoteRecordRef>> =>
    api().registry.request(request),
};

const KNOWN_CODES: readonly IpcErrorCode[] = [
  'VALIDATION_FAILED', 'DUPLICATE', 'NOT_FOUND', 'CONFLICT', 'UNAUTHORIZED', 'FORBIDDEN',
  'DATABASE_UNAVAILABLE', 'MIGRATION_REQUIRED', 'IPC_ERROR', 'UNEXPECTED_ERROR',
  'OFFLINE', 'RATE_LIMITED', 'REMOTE_REJECTED',
];

/** preload/invoke.ts throws `[CODE] message`; online screens branch on the
 * code (OFFLINE disables, RATE_LIMITED waits, REMOTE_REJECTED shows the
 * server's text). Anything unrecognised is null. */
export function parseIpcErrorCode(error: unknown): IpcErrorCode | null {
  if (!(error instanceof Error)) return null;
  const match = /^\[([A-Z_]+)\]/.exec(error.message);
  const code = match?.[1] as IpcErrorCode | undefined;
  return code && KNOWN_CODES.includes(code) ? code : null;
}
