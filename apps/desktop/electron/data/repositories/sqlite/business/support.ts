import { wrapSqliteError } from '../../../../database/errors/wrapSqliteError';

/** Runs a synchronous SQLite read/write, translating any driver failure into
 * the DatabaseError taxonomy (context prefixes the message; the raw error is
 * kept on `cause`). Business adapters call every statement through this so a
 * locked/corrupt database surfaces as ConnectionError/IntegrityError, which
 * errorMapping turns into DATABASE_UNAVAILABLE for the renderer. */
export function guarded<T>(context: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw wrapSqliteError(error, context);
  }
}
