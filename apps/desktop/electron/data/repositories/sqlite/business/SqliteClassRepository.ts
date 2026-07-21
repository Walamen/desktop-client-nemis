import { Class } from '@nemis-desktop/domain';
import type { IClassRepository } from '@nemis-desktop/application';
import type { GradeLevel } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface ClassRow {
  id: string;
  institutionId: string;
  academicYearId: string;
  name: string;
  gradeLevel: string;
  capacity: number | null;
  isActive: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toClass(row: ClassRow): Class {
  return Class.reconstitute({
    id: row.id,
    institutionId: row.institutionId,
    academicYearId: row.academicYearId,
    name: row.name,
    gradeLevel: row.gradeLevel as GradeLevel,
    capacity: row.capacity ?? undefined,
    isActive: row.isActive === 1,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, academicYearId, name, gradeLevel, capacity, isActive, version, updatedAt, lastModifiedBy';

/** Read-only SQLite adapter for IClassRepository. Write paths (create/update)
 * are not built this phase; the dashboard only needs findById/exists/countAll. */
export class SqliteClassRepository implements IClassRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): Class | null {
    return guarded('SqliteClassRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.classes} WHERE id = ? LIMIT 1`)
        .get(id) as ClassRow | undefined;
      return row ? toClass(row) : null;
    });
  }

  exists(id: string): boolean {
    return guarded('SqliteClassRepository.exists', () => {
      return this.#statements.get(`SELECT id FROM ${TableNames.classes} WHERE id = ? LIMIT 1`).get(id) !== undefined;
    });
  }

  countAll(): number {
    return guarded('SqliteClassRepository.countAll', () => {
      const row = this.#statements.get(`SELECT COUNT(*) AS n FROM ${TableNames.classes}`).get() as { n: number };
      return row.n;
    });
  }
}
