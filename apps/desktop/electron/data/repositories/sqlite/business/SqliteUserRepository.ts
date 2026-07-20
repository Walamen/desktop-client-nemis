import { User, UserOrganization } from '@nemis-desktop/domain';
import type { IUserRepository } from '@nemis-desktop/application';
import type { SystemRole } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface UserRow {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  isActive: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

interface OrgRow {
  id: string;
  role: string;
  institutionId: string | null;
  countyId: string | null;
  districtId: string | null;
  isActive: number;
}

const USER_COLUMNS =
  'id, firstName, middleName, lastName, email, isActive, version, updatedAt, lastModifiedBy';

/** Read-only SQLite adapter for IUserRepository. Loads the user plus its
 * user_organizations rows and reconstitutes the aggregate. */
export class SqliteUserRepository implements IUserRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): User | null {
    return guarded('SqliteUserRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${USER_COLUMNS} FROM ${TableNames.users} WHERE id = ? LIMIT 1`)
        .get(id) as UserRow | undefined;
      return row ? this.#toUser(row) : null;
    });
  }

  findFirst(): User | null {
    return guarded('SqliteUserRepository.findFirst', () => {
      const row = this.#statements
        .get(`SELECT ${USER_COLUMNS} FROM ${TableNames.users} ORDER BY updatedAt ASC, id ASC LIMIT 1`)
        .get() as UserRow | undefined;
      return row ? this.#toUser(row) : null;
    });
  }

  #toUser(row: UserRow): User {
    const orgRows = this.#statements
      .get(
        `SELECT id, role, institutionId, countyId, districtId, isActive
         FROM ${TableNames.userOrganizations} WHERE userId = ?`,
      )
      .all(row.id) as OrgRow[];
    const organizations = orgRows.map((o) =>
      UserOrganization.reconstitute({
        id: o.id,
        role: o.role as SystemRole,
        institutionId: o.institutionId ?? undefined,
        countyId: o.countyId ?? undefined,
        districtId: o.districtId ?? undefined,
        isActive: o.isActive === 1,
      }),
    );
    return User.reconstitute({
      id: row.id,
      firstName: row.firstName,
      middleName: row.middleName ?? undefined,
      lastName: row.lastName,
      email: row.email,
      isActive: row.isActive === 1,
      organizations,
      version: row.version,
      updatedAt: row.updatedAt,
      lastModifiedBy: row.lastModifiedBy ?? undefined,
    });
  }
}
