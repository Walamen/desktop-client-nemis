import {
  ApplicationError,
  OfflineError,
  RateLimitedError,
  RemoteRejectedError,
  toIpcErrorPayload,
} from '@nemis-desktop/shared';
import { AuthenticationUnavailableError } from '@nemis-desktop/application';
import type { IpcErrorCode, IpcErrorPayload } from '@nemis-desktop/types';
import { RepositoryError, ValidationError } from '../data/errors/repositoryErrors';
import { DatabaseError } from '../database/errors/errors';

/** Fixed renderer-facing message per code — internal text never crosses IPC. */
const CODE_MESSAGES: Record<IpcErrorCode, string> = {
  VALIDATION_FAILED: 'The provided data failed validation.',
  DUPLICATE: 'A record with these details already exists.',
  NOT_FOUND: 'The requested record was not found.',
  CONFLICT: 'The operation conflicted with another change. Please try again.',
  UNAUTHORIZED: 'Authentication is required.',
  FORBIDDEN: 'This operation is not allowed.',
  DATABASE_UNAVAILABLE: 'The local database is currently unavailable.',
  MIGRATION_REQUIRED: 'The local database requires an update. Please restart the application.',
  IPC_ERROR: 'The request was malformed.',
  UNEXPECTED_ERROR: 'An unexpected error occurred.',
  OFFLINE: "You're offline. Connect to the internet to do this.",
  RATE_LIMITED: 'Too many attempts. Please wait and try again later.',
  REMOTE_REJECTED: 'The server could not complete this request.',
};

function payloadFor(code: IpcErrorCode): IpcErrorPayload {
  return { code, message: CODE_MESSAGES[code] };
}

const REMOTE_MESSAGE_MAX = 500;

/** Server-authored text is the one exception to "internal text never crosses
 * IPC": it was written for the user by our own server. It still arrives as
 * untrusted bytes, so it is flattened to one printable line and capped. */
export function sanitizeRemoteMessage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return cleaned.length > REMOTE_MESSAGE_MAX
    ? `${cleaned.slice(0, REMOTE_MESSAGE_MAX - 1)}…`
    : cleaned;
}

/** Application-layer wrappers (invokeUseCase masks DatabaseError as
 * UnexpectedApplicationException) bury the original failure on `cause`;
 * bounded so a pathological self-referencing chain cannot loop. */
const MAX_CAUSE_DEPTH = 5;

/**
 * The single source of truth mapping every internal error family onto the
 * renderer-visible IpcErrorCode contract. Every IPC endpoint's catch path —
 * present and future — goes through this function and nothing else.
 * UNAUTHORIZED is defined-and-reserved for Phase 4 authentication.
 */
export function toIpcError(error: unknown): IpcErrorPayload {
  return mapError(error, MAX_CAUSE_DEPTH);
}

function mapError(error: unknown, remainingDepth: number): IpcErrorPayload {
  if (error instanceof OfflineError || error instanceof AuthenticationUnavailableError) {
    return payloadFor('OFFLINE');
  }
  if (error instanceof RateLimitedError) {
    return { code: 'RATE_LIMITED', message: sanitizeRemoteMessage(error.remoteMessage) ?? CODE_MESSAGES.RATE_LIMITED };
  }
  if (error instanceof RemoteRejectedError) {
    return { code: 'REMOTE_REJECTED', message: sanitizeRemoteMessage(error.remoteMessage) ?? CODE_MESSAGES.REMOTE_REJECTED };
  }
  if (error instanceof ValidationError) {
    return {
      ...payloadFor('VALIDATION_FAILED'),
      issues: error.issues.map((issue) => ({ field: issue.field, message: issue.message })),
    };
  }
  if (error instanceof RepositoryError) {
    switch (error.code) {
      case 'REPO_DUPLICATE':
        return payloadFor('DUPLICATE');
      case 'REPO_NOT_FOUND':
        return payloadFor('NOT_FOUND');
      case 'REPO_TRANSACTION':
        return payloadFor('CONFLICT');
      default:
        return payloadFor('UNEXPECTED_ERROR');
    }
  }
  if (error instanceof DatabaseError) {
    switch (error.code) {
      case 'DB_CONNECTION':
        return payloadFor('DATABASE_UNAVAILABLE');
      // Corruption is an availability problem to the user: the restart/support
      // guidance of DATABASE_UNAVAILABLE is the right UX for it.
      case 'DB_INTEGRITY':
        return payloadFor('DATABASE_UNAVAILABLE');
      case 'DB_MIGRATION':
        return payloadFor('MIGRATION_REQUIRED');
      default:
        return payloadFor('UNEXPECTED_ERROR');
    }
  }
  if (error instanceof ApplicationError) {
    // ApplicationError messages are authored by us (arity/shape/allowlist text) — safe.
    return toIpcErrorPayload(error);
  }
  // Nothing matched the wrapper itself — unwrap the cause chain so a
  // DatabaseError masked by the application pipeline still surfaces as
  // DATABASE_UNAVAILABLE (etc.) instead of a generic UNEXPECTED_ERROR.
  if (remainingDepth > 0 && error instanceof Error && error.cause !== undefined) {
    const inner = mapError(error.cause, remainingDepth - 1);
    if (inner.code !== 'UNEXPECTED_ERROR') return inner;
  }
  return payloadFor('UNEXPECTED_ERROR');
}
