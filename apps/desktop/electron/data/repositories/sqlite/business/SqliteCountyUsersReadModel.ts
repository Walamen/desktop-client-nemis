import type {
  CountyUserListItem,
  CountyUserOptions,
  CountyUserRole,
  CountyUsersQuery,
  CountyUsersResult,
  CountyUserStats,
} from '@nemis-desktop/types';
import type { ICountyUsersReadModel } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { districts, institutions, users, userOrganizations, counties } = TableNames;

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** This county's own rows; with no county row synced (older server), all. */
const OWN_COUNTY = (column: string) =>
  `(NOT EXISTS (SELECT 1 FROM ${counties}) OR ${column} IN (SELECT id FROM ${counties}))`;

/** A link (alias `o`) that puts its user on this county's page (spec §5.1):
 * active, DEO or School Admin, and in the county by its county, its school,
 * its district — or a DEO in the unassigned pool. Real principals' links
 * carry only the school, so the school path is the common one. */
const QUALIFYING = `o.isActive = 1 AND o.role IN ('DEO', 'INSTITUTION_ADMIN') AND (
     (o.countyId IS NOT NULL AND ${OWN_COUNTY('o.countyId')})
     OR EXISTS (SELECT 1 FROM ${institutions} qi WHERE qi.id = o.institutionId AND ${OWN_COUNTY('qi.countyId')})
     OR EXISTS (SELECT 1 FROM ${districts} qd WHERE qd.id = o.districtId AND ${OWN_COUNTY('qd.countyId')})
     OR (o.role = 'DEO' AND o.countyId IS NULL AND o.districtId IS NULL))`;

/** One row per listed user with the link that describes them: DEO first, then
 * a placed link before a pool one, then by link id. Placed-first matters after
 * an assignment from the pool: the server closes the pool link, but the
 * county snapshot ships pool links only while active and merge never
 * deletes, so the device can still hold it as active. Materialized so the
 * correlated pick runs once per user, and a user with several qualifying
 * links is still one row. */
const CHOSEN = `WITH chosen AS MATERIALIZED (
  SELECT u.id AS userId,
         (SELECT o.id FROM ${userOrganizations} o
          WHERE o.userId = u.id AND ${QUALIFYING}
          ORDER BY (o.role = 'DEO') DESC,
                   (o.countyId IS NOT NULL OR o.districtId IS NOT NULL OR o.institutionId IS NOT NULL) DESC,
                   o.id
          LIMIT 1) AS linkId
  FROM ${users} u
)`;
/** Listed users (alias `u`) joined to their chosen link (alias `l`). */
const LISTED = `FROM chosen c JOIN ${users} u ON u.id = c.userId JOIN ${userOrganizations} l ON l.id = c.linkId`;

/** LIKE term with % _ \ taken literally (paired with ESCAPE '\'). */
const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  photoUrl: string | null;
  role: CountyUserRole;
  isActive: number;
  emailVerified: number | null;
  lastLoginAt: string | null;
  districtId: string | null;
  districtName: string | null;
  institutionId: string | null;
  schoolName: string | null;
};

/** SQLite read model for the County Administrative Users page
 * (docs/superpowers/specs/2026-10-19-county-users-design.md §5.1–5.3). */
export class SqliteCountyUsersReadModel implements ICountyUsersReadModel {
  readonly #statements: StatementCache;
  readonly #now: () => Date;

  constructor(context: RepositoryContext, now: () => Date = () => new Date()) {
    this.#statements = new StatementCache(context.connection);
    this.#now = now;
  }

  listUsers(query: CountyUsersQuery): Omit<CountyUsersResult, 'county'> {
    return guarded('SqliteCountyUsersReadModel.listUsers', () => {
      const where: string[] = [];
      const params: unknown[] = [];
      const search = query.search?.trim();
      if (search) {
        where.push(
          `(lower(u.firstName) LIKE lower(?) ESCAPE '\\' OR lower(u.lastName) LIKE lower(?) ESCAPE '\\'
            OR lower(u.email) LIKE lower(?) ESCAPE '\\')`,
        );
        const term = likeTerm(search);
        params.push(term, term, term);
      }
      if (query.role) {
        where.push('l.role = ?');
        params.push(query.role);
      }
      const filter = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const { total } = this.#statements.get(`${CHOSEN} SELECT COUNT(*) AS total ${LISTED} ${filter}`).get(...params) as {
        total: number;
      };
      const page = Math.max(query.page, 1);
      const rows = this.#statements
        .get(
          `${CHOSEN}
           SELECT u.id, u.firstName, u.lastName, u.email, u.phoneNumber, u.photoUrl, l.role, u.isActive,
                  u.emailVerified, u.lastLoginAt, l.districtId, d.name AS districtName,
                  l.institutionId, i.name AS schoolName
           ${LISTED}
           LEFT JOIN ${districts} d ON d.id = l.districtId
           LEFT JOIN ${institutions} i ON i.id = l.institutionId
           ${filter}
           ORDER BY u.createdAt IS NULL, u.createdAt DESC, u.id ASC
           LIMIT ? OFFSET ?`,
        )
        .all(...params, query.limit, (page - 1) * query.limit) as UserRow[];

      return { stats: this.#stats(), data: rows.map(toListItem), total };
    });
  }

  listOptions(): Omit<CountyUserOptions, 'county'> {
    return guarded('SqliteCountyUsersReadModel.listOptions', () => ({
      districts: this.#statements
        .get(`SELECT d.id, d.name FROM ${districts} d WHERE ${OWN_COUNTY('d.countyId')} ORDER BY d.name ASC, d.id ASC`)
        .all() as Array<{ id: string; name: string }>,
      schools: this.#statements
        .get(
          `SELECT i.id, i.name, i.districtId FROM ${institutions} i
           WHERE i.type = 'SCHOOL' AND i.isActive = 1 AND ${OWN_COUNTY('i.countyId')}
           ORDER BY i.name ASC, i.id ASC`,
        )
        .all() as Array<{ id: string; name: string; districtId: string | null }>,
    }));
  }

  /** Over every listed user, whatever the search and role filter (§5.2). */
  #stats(): CountyUserStats {
    const activeSince = new Date(this.#now().getTime() - ACTIVE_WINDOW_MS).toISOString();
    return this.#statements
      .get(
        `${CHOSEN}
         SELECT COUNT(*) AS totalUsers,
                COALESCE(SUM(u.isActive = 1 AND u.lastLoginAt >= ?), 0) AS activeUsers,
                COALESCE(SUM(u.emailVerified = 0), 0) AS pendingActivation,
                COALESCE(SUM(l.role = 'INSTITUTION_ADMIN'), 0) AS schoolAdmins
         ${LISTED}`,
      )
      .get(activeSince) as CountyUserStats;
  }
}

function toListItem(row: UserRow): CountyUserListItem {
  return {
    ...row,
    isActive: row.isActive === 1,
    emailVerified: row.emailVerified === null ? null : row.emailVerified === 1,
  };
}
