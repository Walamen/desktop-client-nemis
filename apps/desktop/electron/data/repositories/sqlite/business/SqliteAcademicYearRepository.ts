import { AcademicYear } from '@nemis-desktop/domain';
import type { IAcademicYearRepository } from '@nemis-desktop/application';
import type { AcademicYearStatus } from '@nemis-desktop/types';
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
  status: string;
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
    status: row.status as AcademicYearStatus,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, code, startDate, endDate, isCurrent, status, version, updatedAt, lastModifiedBy';

/** SQLite adapter for IAcademicYearRepository. */
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

  findById(id: string): AcademicYear | null {
    return guarded('SqliteAcademicYearRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.academicYears} WHERE id = ? LIMIT 1`)
        .get(id) as AcademicYearRow | undefined;
      return row ? toAcademicYear(row) : null;
    });
  }

  findAll(): AcademicYear[] {
    return guarded('SqliteAcademicYearRepository.findAll', () => {
      const rows = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.academicYears} ORDER BY startDate DESC`)
        .all() as AcademicYearRow[];
      return rows.map(toAcademicYear);
    });
  }

  existsByCode(institutionId: string, code: string, excludeId?: string): boolean {
    return guarded('SqliteAcademicYearRepository.existsByCode', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.academicYears}
           WHERE institutionId = ? AND code = ? AND id != ? LIMIT 1`,
        )
        .get(institutionId, code, excludeId ?? '');
      return row !== undefined;
    });
  }

  findCurrentOthers(institutionId: string, excludeId: string): AcademicYear[] {
    return guarded('SqliteAcademicYearRepository.findCurrentOthers', () => {
      const rows = this.#statements
        .get(
          `SELECT ${COLUMNS} FROM ${TableNames.academicYears}
           WHERE institutionId = ? AND isCurrent = 1 AND id != ?`,
        )
        .all(institutionId, excludeId) as AcademicYearRow[];
      return rows.map(toAcademicYear);
    });
  }

  save(year: AcademicYear): void {
    guarded('SqliteAcademicYearRepository.save', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.academicYears}
           (id, institutionId, code, startDate, endDate, isCurrent, status, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             institutionId = excluded.institutionId,
             code = excluded.code,
             startDate = excluded.startDate,
             endDate = excluded.endDate,
             isCurrent = excluded.isCurrent,
             status = excluded.status,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          year.id,
          year.institutionId,
          year.code.value,
          year.period.start,
          year.period.end,
          year.isCurrent ? 1 : 0,
          year.status,
          year.version,
          year.updatedAt,
          year.lastModifiedBy ?? null,
        );
    });
  }

  countTerms(academicYearId: string): number {
    return guarded('SqliteAcademicYearRepository.countTerms', () => {
      const row = this.#statements
        .get(`SELECT COUNT(*) AS n FROM ${TableNames.terms} WHERE academicYearId = ?`)
        .get(academicYearId) as { n: number };
      return row.n;
    });
  }

  countClasses(academicYearId: string): number {
    return guarded('SqliteAcademicYearRepository.countClasses', () => {
      const row = this.#statements
        .get(`SELECT COUNT(*) AS n FROM ${TableNames.classes} WHERE academicYearId = ?`)
        .get(academicYearId) as { n: number };
      return row.n;
    });
  }
}
