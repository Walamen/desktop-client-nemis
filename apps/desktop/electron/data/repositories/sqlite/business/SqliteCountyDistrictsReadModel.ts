import type {
  CountyDeoUser,
  CountyDistrictInstitution,
  CountyDistrictListItem,
  CountyDistrictOfficer,
} from '@nemis-desktop/types';
import type { ICountyDistrictsReadModel } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { districts, institutions, students, staff, users, userOrganizations, counties } = TableNames;

/** This county's own rows; with no county row synced (older server), all. */
const OWN_COUNTY = (alias: string) =>
  `(NOT EXISTS (SELECT 1 FROM ${counties}) OR ${alias}.countyId IN (SELECT id FROM ${counties}))`;
const ACTIVE_DEO = (alias: string) => `${alias}.role = 'DEO' AND ${alias}.isActive = 1`;

type DistrictRow = {
  id: string;
  name: string;
  code: string | null;
  isActive: number;
  activeSchoolCount: number;
  activeDeoCount: number;
  deoUserId: string | null;
  deoFirstName: string | null;
  deoLastName: string | null;
  deoEmail: string | null;
  deoPhotoUrl: string | null;
};
type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
  isActive: number;
  lastLoginAt: string | null;
  photoUrl: string | null;
};
type InstitutionRow = Omit<CountyDistrictInstitution, 'metadata' | 'isActive'> & {
  profile: string | null;
  isActive: number;
};

/** The institution profile is the server's metadata plus `levels`; the
 * district pages read the metadata alone, as the web does. */
function parseMetadata(profile: string | null): Record<string, unknown> | null {
  if (!profile) return null;
  const { levels: _levels, ...metadata } = JSON.parse(profile) as Record<string, unknown>;
  return metadata;
}

/** Read-only SQLite adapter for ICountyDistrictsReadModel. */
export class SqliteCountyDistrictsReadModel implements ICountyDistrictsReadModel {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  listActiveDistricts(): CountyDistrictListItem[] {
    return guarded('SqliteCountyDistrictsReadModel.listActiveDistricts', () => {
      const rows = this.#statements
        .get(
          `SELECT d.id, d.name, d.code, d.isActive,
             (SELECT COUNT(*) FROM ${institutions} i WHERE i.districtId = d.id AND i.isActive = 1) AS activeSchoolCount,
             (SELECT COUNT(*) FROM ${userOrganizations} o WHERE o.districtId = d.id AND ${ACTIVE_DEO('o')}) AS activeDeoCount,
             u.id AS deoUserId, u.firstName AS deoFirstName, u.lastName AS deoLastName,
             u.email AS deoEmail, u.photoUrl AS deoPhotoUrl
           FROM ${districts} d
           LEFT JOIN ${users} u ON u.id = (
             SELECT o.userId FROM ${userOrganizations} o
             WHERE o.districtId = d.id AND ${ACTIVE_DEO('o')}
             ORDER BY o.id LIMIT 1)
           WHERE d.isActive = 1 AND ${OWN_COUNTY('d')}
           ORDER BY d.name ASC`,
        )
        .all() as DistrictRow[];
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        isActive: row.isActive === 1,
        activeSchoolCount: row.activeSchoolCount,
        activeDeoCount: row.activeDeoCount,
        firstDeo: row.deoUserId
          ? {
              userId: row.deoUserId,
              firstName: row.deoFirstName ?? '',
              lastName: row.deoLastName ?? '',
              email: row.deoEmail,
              photoUrl: row.deoPhotoUrl,
            }
          : null,
      }));
    });
  }

  getDistrict(id: string) {
    return guarded('SqliteCountyDistrictsReadModel.getDistrict', () => {
      const row = this.#statements
        .get(`SELECT d.id, d.name, d.code, d.isActive FROM ${districts} d WHERE d.id = ? AND ${OWN_COUNTY('d')}`)
        .get(id) as { id: string; name: string; code: string | null; isActive: number } | undefined;
      return row ? { ...row, isActive: row.isActive === 1 } : null;
    });
  }

  listDistrictInstitutions(districtId: string): CountyDistrictInstitution[] {
    return guarded('SqliteCountyDistrictsReadModel.listDistrictInstitutions', () => {
      const rows = this.#statements
        .get(
          `SELECT id, name, code, type, emisCode, officialSchoolCode, street, communityTown, ownership,
                  contactPhone, contactPersonPhone, profile, isActive
           FROM ${institutions}
           WHERE districtId = ? AND isActive = 1
           ORDER BY name ASC`,
        )
        .all(districtId) as InstitutionRow[];
      return rows.map(({ profile, isActive, ...row }) => ({
        ...row,
        metadata: parseMetadata(profile),
        isActive: isActive === 1,
      }));
    });
  }

  getDistrictCounts(districtId: string) {
    return guarded('SqliteCountyDistrictsReadModel.getDistrictCounts', () => {
      return this.#statements
        .get(
          `SELECT
             (SELECT COUNT(*) FROM ${institutions} WHERE districtId = @d AND isActive = 1) AS schools,
             (SELECT COUNT(*) FROM ${students} s JOIN ${institutions} i ON i.id = s.institutionId
                WHERE i.districtId = @d AND i.isActive = 1 AND s.isActive = 1) AS students,
             (SELECT COUNT(*) FROM ${staff} t JOIN ${institutions} i ON i.id = t.institutionId
                WHERE i.districtId = @d AND i.isActive = 1 AND t.isActive = 1
                  AND t.position IN ('TEACHER', 'ASSISTANT_TEACHER')) AS teachers,
             (SELECT COUNT(*) FROM ${userOrganizations} o WHERE o.districtId = @d AND ${ACTIVE_DEO('o')}) AS deos`,
        )
        .get({ d: districtId }) as { schools: number; students: number; teachers: number; deos: number };
    });
  }

  listDistrictOfficers(districtId: string): CountyDistrictOfficer[] {
    return guarded('SqliteCountyDistrictsReadModel.listDistrictOfficers', () => {
      const rows = this.#statements
        .get(
          `SELECT u.id, u.firstName, u.lastName, u.email, u.phoneNumber, u.isActive, u.lastLoginAt, u.photoUrl
           FROM ${userOrganizations} o JOIN ${users} u ON u.id = o.userId
           WHERE o.districtId = ? AND ${ACTIVE_DEO('o')}
           ORDER BY o.id ASC`,
        )
        .all(districtId) as UserRow[];
      return rows.map((row) => ({
        userId: row.id,
        name: `${row.firstName} ${row.lastName}`,
        email: row.email,
        phoneNumber: row.phoneNumber,
        isActive: row.isActive === 1,
        lastLoginAt: row.lastLoginAt,
        photoUrl: row.photoUrl,
      }));
    });
  }

  listCountyDeoUsers(): CountyDeoUser[] {
    return guarded('SqliteCountyDistrictsReadModel.listCountyDeoUsers', () => {
      const rows = this.#statements
        .get(
          `SELECT u.id, u.firstName, u.lastName, u.email, u.phoneNumber, u.isActive, u.lastLoginAt, u.photoUrl,
             (SELECT o2.districtId FROM ${userOrganizations} o2
              WHERE o2.userId = u.id AND ${ACTIVE_DEO('o2')} AND o2.districtId IS NOT NULL AND ${OWN_COUNTY('o2')}
              ORDER BY o2.id LIMIT 1) AS districtId
           FROM ${users} u
           WHERE EXISTS (
             SELECT 1 FROM ${userOrganizations} o
             WHERE o.userId = u.id AND ${ACTIVE_DEO('o')}
               AND ((o.countyId IS NOT NULL AND ${OWN_COUNTY('o')})
                    OR (o.countyId IS NULL AND o.districtId IS NULL)))
           ORDER BY u.createdAt DESC, u.id ASC`,
        )
        .all() as (UserRow & { districtId: string | null })[];
      return rows.map((row) => ({ ...row, isActive: row.isActive === 1 }));
    });
  }
}
