import { Institution } from '@nemis-desktop/domain';
import type { IInstitutionRepository } from '@nemis-desktop/application';
import type { ApprovalStatus, InstitutionType, OwnershipType } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface InstitutionRow {
  id: string;
  code: string;
  name: string;
  type: string;
  ownership: string;
  countyId: string;
  districtId: string | null;
  approvalStatus: string;
  street: string | null;
  communityTown: string | null;
  latitude: number | null;
  longitude: number | null;
  rejectionReason: string | null;
  profile: string | null;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toInstitution(row: InstitutionRow): Institution {
  return Institution.reconstitute({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type as InstitutionType,
    ownership: row.ownership as OwnershipType,
    countyId: row.countyId,
    districtId: row.districtId ?? undefined,
    approvalStatus: row.approvalStatus as ApprovalStatus,
    address: { street: row.street ?? undefined, communityTown: row.communityTown ?? undefined },
    location:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    profile: row.profile ? (JSON.parse(row.profile) as Record<string, unknown>) : undefined,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, code, name, type, ownership, countyId, districtId, approvalStatus, street, communityTown, latitude, longitude, rejectionReason, profile, version, updatedAt, lastModifiedBy';

/** Read-only SQLite adapter for IInstitutionRepository. */
export class SqliteInstitutionRepository implements IInstitutionRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): Institution | null {
    return guarded('SqliteInstitutionRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.institutions} WHERE id = ? LIMIT 1`)
        .get(id) as InstitutionRow | undefined;
      return row ? toInstitution(row) : null;
    });
  }

  findFirst(): Institution | null {
    return guarded('SqliteInstitutionRepository.findFirst', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.institutions} ORDER BY updatedAt ASC, id ASC LIMIT 1`)
        .get() as InstitutionRow | undefined;
      return row ? toInstitution(row) : null;
    });
  }

  findAll(): Institution[] {
    return guarded('SqliteInstitutionRepository.findAll', () => {
      const rows = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.institutions} ORDER BY name ASC, id ASC`)
        .all() as InstitutionRow[];
      return rows.map(toInstitution);
    });
  }
}
