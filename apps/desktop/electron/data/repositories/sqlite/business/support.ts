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

/** True unless the alert's metadata names the requesting staffId: a
 * teacher's edit request, which is the school admin's to answer, not the
 * district's (Nemis common/district/school-standing.ts isSchoolStaffRequest).
 * Unreadable metadata counts as an ordinary alert. */
export function notSchoolStaffRequest(metadataColumn: string): string {
  return `(${metadataColumn} IS NULL OR NOT json_valid(${metadataColumn})
    OR json_type(${metadataColumn}, '$.staffId') IS NOT 'text')`;
}

/** County read models: this county's own schools (institution alias `i`);
 * with no county row synced (older server), all. */
export const OWN_COUNTY = `(NOT EXISTS (SELECT 1 FROM counties) OR i.countyId IN (SELECT id FROM counties))`;
