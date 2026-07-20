import type { Database as SqliteDatabase } from 'better-sqlite3';
import { SystemRole } from '@nemis-desktop/types';
import { wrapSqliteError } from '../errors/wrapSqliteError';
import { newId } from '../helpers/ids';
import { nowIso } from '../helpers/time';
import { TableNames } from '../schema/tableNames';

export interface LocalUserInitResult {
  userId: string;
  userCreated: boolean;
}

/** The single local operator this desktop install runs as until authentication
 * exists. A real row (not a hardcoded object) so the identity read path is
 * exercised end-to-end. No school is attached yet (institutionId NULL). */
const LOCAL_USER = {
  firstName: 'Local',
  lastName: 'Admin',
  email: 'admin@local.nemis',
  role: SystemRole.INSTITUTION_ADMIN,
} as const;

/**
 * Idempotent first-run seed, run on every startup after migrations and
 * metadata init: ensures exactly one local user + its organization role.
 * No other business table is ever seeded.
 */
export function initializeLocalUser(db: SqliteDatabase): LocalUserInitResult {
  try {
    return db.transaction((): LocalUserInitResult => {
      const existing = db.prepare(`SELECT id FROM ${TableNames.users} LIMIT 1`).get() as
        | { id: string }
        | undefined;
      if (existing) {
        return { userId: existing.id, userCreated: false };
      }

      const now = nowIso();
      const userId = newId();
      db.prepare(
        `INSERT INTO ${TableNames.users}
         (id, firstName, middleName, lastName, email, isActive, version, updatedAt, lastModifiedBy, deviceId)
         VALUES (?, ?, NULL, ?, ?, 1, 1, ?, NULL, NULL)`,
      ).run(userId, LOCAL_USER.firstName, LOCAL_USER.lastName, LOCAL_USER.email, now);

      db.prepare(
        `INSERT INTO ${TableNames.userOrganizations}
         (id, userId, role, institutionId, countyId, districtId, isActive)
         VALUES (?, ?, ?, NULL, NULL, NULL, 1)`,
      ).run(newId(), userId, LOCAL_USER.role);

      return { userId, userCreated: true };
    })();
  } catch (error) {
    throw wrapSqliteError(error, 'local user initialization');
  }
}
