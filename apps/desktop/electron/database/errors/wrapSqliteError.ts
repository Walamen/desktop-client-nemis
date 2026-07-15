import { ConnectionError, ConstraintError, DatabaseError, IntegrityError } from './errors';

interface CodedError extends Error {
  code: string;
}

function isSqliteCodedError(error: unknown): error is CodedError {
  return (
    error instanceof Error &&
    typeof (error as Partial<CodedError>).code === 'string' &&
    (error as CodedError).code.startsWith('SQLITE_')
  );
}

/**
 * Converts any thrown value into the DatabaseError taxonomy.
 * The wrapped message carries only our context + the SQLite result code —
 * the raw driver message (which can embed schema/data details) stays on cause.
 */
export function wrapSqliteError(error: unknown, context: string): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }
  if (isSqliteCodedError(error)) {
    const { code } = error;
    const message = `${context}: database operation failed (${code})`;
    if (code.startsWith('SQLITE_CONSTRAINT')) {
      return new ConstraintError(message, { cause: error });
    }
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || code === 'SQLITE_CANTOPEN') {
      return new ConnectionError(message, { cause: error });
    }
    if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB' || code === 'SQLITE_MISMATCH') {
      return new IntegrityError(message, { cause: error });
    }
    return new DatabaseError(message, 'DB_UNKNOWN', { cause: error });
  }
  return new DatabaseError(`${context}: unexpected database failure`, 'DB_UNKNOWN', {
    cause: error,
  });
}
