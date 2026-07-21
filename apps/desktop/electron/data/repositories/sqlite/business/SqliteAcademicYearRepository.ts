import { AcademicYear } from '@nemis-desktop/domain';
import type { IAcademicYearRepository } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface AcademicYearRow {
  id: string;
  institutionId: string;
  code: string;
  startDate: string;
  endDate: string;
  isCurrent: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toAcademicYear(row: AcademicYearRow): AcademicYear {
  return AcademicYear.reconstitute({
    id: row.id,
    institutionId: row.institutionId,
    code: row.code,
    start: row.startDate,
    end: row.endDate,
    isCurrent: row.isCurrent === 1,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, code, startDate, endDate, isCurrent, version, updatedAt, lastModifiedBy';

/** Read-only SQLite adapter for IAcademicYearRepository. */
export class SqliteAcademicYearRepository implements IAcademicYearRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findCurrent(): AcademicYear | null {
    return guarded('SqliteAcademicYearRepository.findCurrent', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.academicYears} WHERE isCurrent = 1 LIMIT 1`)
        .get() as AcademicYearRow | undefined;
      return row ? toAcademicYear(row) : null;
    });
  }
}
