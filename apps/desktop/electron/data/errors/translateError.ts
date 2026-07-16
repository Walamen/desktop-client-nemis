import { DatabaseError } from '../../database/errors/errors';
import { wrapSqliteError } from '../../database/errors/wrapSqliteError';
import { DuplicateEntityError, RepositoryError, TransactionFailureError } from './repositoryErrors';

const UNIQUE_VIOLATION_CODES = new Set([
  'SQLITE_CONSTRAINT_UNIQUE',
  'SQLITE_CONSTRAINT_PRIMARYKEY',
]);

function hasUniqueViolationInChain(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string' && UNIQUE_VIOLATION_CODES.has(code)) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/**
 * Converts anything thrown below the repository boundary into the
 * RepositoryError taxonomy. RepositoryErrors pass through unchanged;
 * everything else is normalized through the database taxonomy first and kept
 * on `cause` — raw driver errors never leave the data layer.
 */
export function translateDatabaseError(error: unknown, context: string): RepositoryError {
  if (error instanceof RepositoryError) {
    return error;
  }
  const wrapped = error instanceof DatabaseError ? error : wrapSqliteError(error, context);
  if (wrapped.code === 'DB_CONSTRAINT' && hasUniqueViolationInChain(error)) {
    return new DuplicateEntityError(`${context}: entity already exists`, { cause: wrapped });
  }
  if (wrapped.code === 'DB_TRANSACTION') {
    return new TransactionFailureError(`${context}: transaction failed`, { cause: wrapped });
  }
  return new RepositoryError(`${context}: data access failed (${wrapped.code})`, 'REPO_UNKNOWN', {
    cause: wrapped,
  });
}
