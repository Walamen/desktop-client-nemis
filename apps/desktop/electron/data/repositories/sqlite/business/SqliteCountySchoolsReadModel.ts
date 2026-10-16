import type { CountySchoolDetail, CountySchoolDetails, CountySchoolListItem } from '@nemis-desktop/types';
import type { ICountySchoolsReadModel } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { institutions, districts, counties, students, staff, institutionAdmin } = TableNames;

/** This county's own schools; with no county row synced (older server), all. */
const OWN_COUNTY = `(NOT EXISTS (SELECT 1 FROM ${counties}) OR i.countyId IN (SELECT id FROM ${counties}))`;

/** A corrupt JSON column must not blank a whole page: it reads as missing. */
function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function levelsOf(profile: Record<string, unknown> | null): string[] {
  const levels = profile?.levels;
  return Array.isArray(levels) ? levels.filter((level): level is string => typeof level === 'string') : [];
}

/** The profile is the server's metadata plus `levels`; pages read the metadata alone. */
function metadataOf(profile: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!profile) return null;
  const metadata = { ...profile };
  delete metadata.levels;
  return metadata;
}

type ListRow = {
  id: string;
  name: string;
  code: string;
  type: string;
  isActive: number;
  districtName: string | null;
  profile: string | null;
  details: string | null;
  studentCount: number;
};
type DetailRow = ListRow & {
  ownership: string;
  approvalStatus: string;
  street: string | null;
  communityTown: string | null;
  contactPhone: string | null;
  contactPersonPhone: string | null;
  emisCode: string | null;
  officialSchoolCode: string | null;
  countyName: string | null;
  staffCount: number;
};

/** Read-only SQLite adapter for ICountySchoolsReadModel. */
export class SqliteCountySchoolsReadModel implements ICountySchoolsReadModel {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  listActiveSchools(): CountySchoolListItem[] {
    return guarded('SqliteCountySchoolsReadModel.listActiveSchools', () => {
      const rows = this.#statements
        .get(
          `SELECT i.id, i.name, i.code, i.type, i.isActive, d.name AS districtName, i.profile, i.details,
             (SELECT COUNT(*) FROM ${students} s WHERE s.institutionId = i.id) AS studentCount
           FROM ${institutions} i LEFT JOIN ${districts} d ON d.id = i.districtId
           WHERE i.isActive = 1 AND ${OWN_COUNTY}
           ORDER BY i.name ASC`,
        )
        .all() as ListRow[];
      return rows.map((row) => {
        const details = parseObject(row.details);
        return {
          id: row.id,
          name: row.name,
          code: row.code,
          type: row.type,
          isActive: row.isActive === 1,
          districtName: row.districtName,
          levels: levelsOf(parseObject(row.profile)),
          studentCount: row.studentCount,
          photoUrl: typeof details?.photoUrl === 'string' ? details.photoUrl : null,
        };
      });
    });
  }

  getSchool(id: string): CountySchoolDetail | null {
    return guarded('SqliteCountySchoolsReadModel.getSchool', () => {
      const row = this.#statements
        .get(
          `SELECT i.id, i.name, i.code, i.type, i.isActive, i.ownership, i.approvalStatus, i.street,
                  i.communityTown, i.contactPhone, i.contactPersonPhone, i.emisCode, i.officialSchoolCode,
                  i.profile, i.details, d.name AS districtName, c.name AS countyName,
             (SELECT COUNT(*) FROM ${students} s WHERE s.institutionId = i.id) AS studentCount,
             (SELECT COUNT(*) FROM ${staff} t WHERE t.institutionId = i.id) AS staffCount
           FROM ${institutions} i
           LEFT JOIN ${districts} d ON d.id = i.districtId
           LEFT JOIN ${counties} c ON c.id = i.countyId
           WHERE i.id = ? AND ${OWN_COUNTY}`,
        )
        .get(id) as DetailRow | undefined;
      if (!row) return null;
      const principal = this.#statements
        .get(
          `SELECT firstName, lastName, email, photoUrl FROM ${institutionAdmin}
           WHERE institutionId = ? AND isActive = 1 ORDER BY id ASC LIMIT 1`,
        )
        .get(id) as CountySchoolDetail['principal'] | undefined;
      const profile = parseObject(row.profile);
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        type: row.type,
        ownership: row.ownership,
        approvalStatus: row.approvalStatus,
        isActive: row.isActive === 1,
        street: row.street,
        communityTown: row.communityTown,
        contactPhone: row.contactPhone,
        contactPersonPhone: row.contactPersonPhone,
        emisCode: row.emisCode,
        officialSchoolCode: row.officialSchoolCode,
        metadata: metadataOf(profile),
        levels: levelsOf(profile),
        details: parseObject(row.details) as CountySchoolDetails | null,
        districtName: row.districtName,
        countyName: row.countyName,
        studentCount: row.studentCount,
        staffCount: row.staffCount,
        principal: principal ?? null,
      };
    });
  }
}
