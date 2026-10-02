import type { IpcErrorCode } from '@nemis-desktop/types';

/** Compiler-enforced: adding an IpcErrorCode without listing it here fails
 * typecheck, so the parser can never silently drop a new code. */
const KNOWN_CODES: Record<IpcErrorCode, true> = {
  VALIDATION_FAILED: true,
  DUPLICATE: true,
  NOT_FOUND: true,
  CONFLICT: true,
  UNAUTHORIZED: true,
  FORBIDDEN: true,
  DATABASE_UNAVAILABLE: true,
  MIGRATION_REQUIRED: true,
  IPC_ERROR: true,
  UNEXPECTED_ERROR: true,
  OFFLINE: true,
  RATE_LIMITED: true,
  REMOTE_REJECTED: true,
};

function isKnownCode(code: string): code is IpcErrorCode {
  return Object.prototype.hasOwnProperty.call(KNOWN_CODES, code);
}

/** Parses the `[CODE] message` text the preload bridge throws on IpcResult
 * failure. `message` is what follows the prefix. Null when the error is not in
 * that shape or the code is not a known IpcErrorCode. */
export function parseIpcError(error: unknown): { code: IpcErrorCode; message: string } | null {
  if (!(error instanceof Error)) return null;
  const match = /^\[([A-Z_]+)\]\s?([\s\S]*)$/.exec(error.message);
  const code = match?.[1];
  if (!match || !code || !isKnownCode(code)) return null;
  return { code, message: match[2] ?? '' };
}
