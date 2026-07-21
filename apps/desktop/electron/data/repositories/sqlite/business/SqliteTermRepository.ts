import { Term } from '@nemis-desktop/domain';
import type { ITermRepository } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface TermRow {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toTerm(row: TermRow): Term {
  return Term.reconstitute({
    id: row.id,
    academicYearId: row.academicYearId,
    name: row.name,
    start: row.startDate,
    end: row.endDate,
    isCurrent: row.isCurrent === 1,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, academicYearId, name, startDate, endDate, isCurrent, version, updatedAt, lastModifiedBy';

/** SQLite adapter for ITermRepository. */
export class SqliteTermRepository implements ITermRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): Term | null {
    return guarded('SqliteTermRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.terms} WHERE id = ? LIMIT 1`)
        .get(id) as TermRow | undefined;
      return row ? toTerm(row) : null;
    });
  }

  findByYear(academicYearId: string): Term[] {
    return guarded('SqliteTermRepository.findByYear', () => {
      const rows = this.#statements
        .get(
          `SELECT ${COLUMNS} FROM ${TableNames.terms} WHERE academicYearId = ? ORDER BY startDate ASC`,
        )
        .all(academicYearId) as TermRow[];
      return rows.map(toTerm);
    });
  }

  findCurrent(): Term | null {
    return guarded('SqliteTermRepository.findCurrent', () => {
      const row = this.#statements
        .get(
          `SELECT t.id, t.academicYearId, t.name, t.startDate, t.endDate, t.isCurrent,
                  t.version, t.updatedAt, t.lastModifiedBy
           FROM ${TableNames.terms} t
           JOIN ${TableNames.academicYears} y ON y.id = t.academicYearId
           WHERE t.isCurrent = 1 AND y.isCurrent = 1
           LIMIT 1`,
        )
        .get() as TermRow | undefined;
      return row ? toTerm(row) : null;
    });
  }

  existsByName(academicYearId: string, name: string, excludeId?: string): boolean {
    return guarded('SqliteTermRepository.existsByName', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.terms}
           WHERE academicYearId = ? AND name = ? AND id != ? LIMIT 1`,
        )
        .get(academicYearId, name, excludeId ?? '');
      return row !== undefined;
    });
  }

  findCurrentOthers(academicYearId: string, excludeId: string): Term[] {
    return guarded('SqliteTermRepository.findCurrentOthers', () => {
      const rows = this.#statements
        .get(
          `SELECT ${COLUMNS} FROM ${TableNames.terms}
           WHERE academicYearId = ? AND isCurrent = 1 AND id != ?`,
        )
        .all(academicYearId, excludeId) as TermRow[];
      return rows.map(toTerm);
    });
  }

  save(term: Term): void {
    guarded('SqliteTermRepository.save', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.terms}
           (id, academicYearId, name, startDate, endDate, isCurrent, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             academicYearId = excluded.academicYearId,
             name = excluded.name,
             startDate = excluded.startDate,
             endDate = excluded.endDate,
             isCurrent = excluded.isCurrent,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          term.id,
          term.academicYearId,
          term.name,
          term.period.start,
          term.period.end,
          term.isCurrent ? 1 : 0,
          term.version,
          term.updatedAt,
          term.lastModifiedBy ?? null,
        );
    });
  }

  delete(id: string): void {
    guarded('SqliteTermRepository.delete', () => {
      this.#statements.get(`DELETE FROM ${TableNames.terms} WHERE id = ?`).run(id);
    });
  }
}
