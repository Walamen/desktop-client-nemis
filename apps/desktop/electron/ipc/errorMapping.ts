import { ApplicationError, toIpcErrorPayload } from '@nemis-desktop/shared';
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
};

function payloadFor(code: IpcErrorCode): IpcErrorPayload {
  return { code, message: CODE_MESSAGES[code] };
}

/**
 * The single source of truth mapping every internal error family onto the
 * renderer-visible IpcErrorCode contract. Every IPC endpoint's catch path —
 * present and future — goes through this function and nothing else.
 * UNAUTHORIZED is defined-and-reserved for Phase 4 authentication.
 */
export function toIpcError(error: unknown): IpcErrorPayload {
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
  return payloadFor('UNEXPECTED_ERROR');
}
