import type { YearClosureRow } from '@nemis-desktop/types';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface ArchiveRow {
  academicYearId: string;
  institutionId: string;
  yearCode: string | null;
  schoolName: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  summary: string | null;
}

function count(summary: Record<string, unknown>, key: string): number {
  const value = summary[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseSummary(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Closed academic years across the schools in this (district or county)
 * workspace. The archive table is pull-only and holds one row per close, so
 * each school-year shows its latest version; a reopened year carries
 * `reopenedAt` on that version until it is closed again. */
export class SqliteYearArchiveReadModel {
  readonly #repository: Pick<RepositoryContext, 'connection'>;

  constructor(repository: Pick<RepositoryContext, 'connection'>) {
    this.#repository = repository;
  }

  list(): YearClosureRow[] {
    return guarded('SqliteYearArchiveReadModel.list', () => {
      const rows = this.#repository.connection
        .prepare(
          `SELECT a.academicYearId, a.institutionId, y.code AS yearCode, i.name AS schoolName,
                  a.closedAt, a.reopenedAt, a.summary
           FROM academic_year_archives a
           LEFT JOIN academic_years y ON y.id = a.academicYearId
           LEFT JOIN institutions i ON i.id = a.institutionId
           WHERE a.version = (
             SELECT MAX(b.version) FROM academic_year_archives b WHERE b.academicYearId = a.academicYearId
           )
           ORDER BY a.closedAt DESC, a.id`,
        )
        .all() as ArchiveRow[];
      return rows.map((row) => {
        const summary = parseSummary(row.summary);
        return {
          academicYearId: row.academicYearId,
          yearCode: row.yearCode ?? '',
          institutionId: row.institutionId,
          schoolName: row.schoolName ?? '',
          status: row.reopenedAt ? 'REOPENED' : 'CLOSED',
          closedAt: row.closedAt,
          promoted: count(summary, 'promoted'),
          retained: count(summary, 'retained'),
          graduated: count(summary, 'graduated'),
        };
      });
    });
  }
}
