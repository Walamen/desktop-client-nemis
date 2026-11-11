import {
  isSchoolModule,
  type LinkableStaff,
  type SchoolModule,
  type SchoolOfficeUser,
  type SchoolUsersResult,
} from '@nemis-desktop/types';
import type { ISchoolUsersReadModel } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { users, userOrganizations, staff } = TableNames;

const OFFICE_ROLES = `('INSTITUTION_ADMIN', 'INSTITUTION_STAFF')`;

type UserRow = Omit<SchoolOfficeUser, 'modules' | 'isActive'> & {
  modules: string | null;
  isActive: number;
};

/** SQLite read model for the Users & Access page: the offline fallback when the
 * server list cannot be reached. One row per user — their admin link before a
 * staff one if, oddly, both exist at this school. */
export class SqliteSchoolUsersReadModel implements ISchoolUsersReadModel {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  list(institutionId: string): Omit<SchoolUsersResult, 'source'> {
    return guarded('SqliteSchoolUsersReadModel.list', () => {
      const rows = this.#statements
        .get(
          `SELECT u.id, u.firstName, u.lastName, u.email, u.phoneNumber, u.photoUrl, o.role, o.title,
                  o.modules, o.isActive, u.lastLoginAt, s.id AS staffId
           FROM ${userOrganizations} o
           JOIN ${users} u ON u.id = o.userId
           LEFT JOIN ${staff} s ON s.userId = u.id AND s.institutionId = o.institutionId
           WHERE o.institutionId = ? AND o.role IN ${OFFICE_ROLES}
             AND o.id = (SELECT o2.id FROM ${userOrganizations} o2
                         WHERE o2.userId = o.userId AND o2.institutionId = o.institutionId
                           AND o2.role IN ${OFFICE_ROLES}
                         ORDER BY (o2.role = 'INSTITUTION_ADMIN') DESC, o2.isActive DESC, o2.id
                         LIMIT 1)
           ORDER BY (o.role = 'INSTITUTION_ADMIN') DESC, u.lastName, u.firstName, u.id`,
        )
        .all(institutionId) as UserRow[];

      const linkableStaff = this.#statements
        .get(
          `SELECT id, firstName, lastName, position FROM ${staff}
           WHERE institutionId = ? AND userId IS NULL AND isActive = 1
           ORDER BY lastName, firstName, id`,
        )
        .all(institutionId) as LinkableStaff[];

      return { users: rows.map(toOfficeUser), linkableStaff };
    });
  }
}

function toOfficeUser(row: UserRow): SchoolOfficeUser {
  return { ...row, modules: parseModules(row.modules), isActive: row.isActive === 1 };
}

/** Malformed JSON reads as no modules; ids this build does not know grant nothing. */
function parseModules(raw: string | null): SchoolModule[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is SchoolModule => typeof value === 'string' && isSchoolModule(value),
    );
  } catch {
    return [];
  }
}
