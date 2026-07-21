import { Class } from '@nemis-desktop/domain';
import type {
  ClassPage,
  ClassPageFilter,
  GradeLevelCount,
  IClassRepository,
} from '@nemis-desktop/application';
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
  section: string | null;
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
    section: row.section ?? undefined,
    gradeLevel: row.gradeLevel as GradeLevel,
    capacity: row.capacity ?? undefined,
    isActive: row.isActive === 1,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, academicYearId, name, section, gradeLevel, capacity, isActive, version, updatedAt, lastModifiedBy';

const SORT_COLUMNS: Record<NonNullable<ClassPageFilter['sort']>, string> = {
  name: 'name',
  gradeLevel: 'gradeLevel',
  updatedAt: 'updatedAt',
};

/** SQLite adapter for IClassRepository. */
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
      return (
        this.#statements.get(`SELECT id FROM ${TableNames.classes} WHERE id = ? LIMIT 1`).get(id) !==
        undefined
      );
    });
  }

  countAll(): number {
    return guarded('SqliteClassRepository.countAll', () => {
      const row = this.#statements.get(`SELECT COUNT(*) AS n FROM ${TableNames.classes}`).get() as {
        n: number;
      };
      return row.n;
    });
  }

  findPage(filter: ClassPageFilter): ClassPage {
    return guarded('SqliteClassRepository.findPage', () => {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (!filter.includeInactive) clauses.push('isActive = 1');
      if (filter.academicYearId) {
        clauses.push('academicYearId = ?');
        params.push(filter.academicYearId);
      }
      if (filter.gradeLevel) {
        clauses.push('gradeLevel = ?');
        params.push(filter.gradeLevel);
      }
      if (filter.keyword) {
        clauses.push('name LIKE ?');
        params.push(`%${filter.keyword}%`);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const orderBy = SORT_COLUMNS[filter.sort ?? 'name'];

      const total = (
        this.#statements
          .get(`SELECT COUNT(*) AS n FROM ${TableNames.classes} ${where}`)
          .get(...params) as { n: number }
      ).n;

      const rows = this.#statements
        .get(
          `SELECT ${COLUMNS} FROM ${TableNames.classes} ${where}
           ORDER BY ${orderBy} ASC LIMIT ? OFFSET ?`,
        )
        .all(...params, filter.limit, filter.offset) as ClassRow[];

      return { items: rows.map(toClass), total };
    });
  }

  existsByName(
    institutionId: string,
    academicYearId: string,
    name: string,
    excludeId?: string,
  ): boolean {
    return guarded('SqliteClassRepository.existsByName', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.classes}
           WHERE institutionId = ? AND academicYearId = ? AND name = ? AND id != ? LIMIT 1`,
        )
        .get(institutionId, academicYearId, name, excludeId ?? '');
      return row !== undefined;
    });
  }

  countByGradeLevel(): GradeLevelCount[] {
    return guarded('SqliteClassRepository.countByGradeLevel', () => {
      const rows = this.#statements
        .get(
          `SELECT gradeLevel, COUNT(*) AS classCount FROM ${TableNames.classes}
           WHERE isActive = 1 GROUP BY gradeLevel`,
        )
        .all() as { gradeLevel: string; classCount: number }[];
      return rows.map((row) => ({
        gradeLevel: row.gradeLevel as GradeLevel,
        classCount: row.classCount,
      }));
    });
  }

  countSubjects(classId: string): number {
    return guarded('SqliteClassRepository.countSubjects', () => {
      const row = this.#statements
        .get(`SELECT COUNT(*) AS n FROM ${TableNames.classSubjects} WHERE classId = ?`)
        .get(classId) as { n: number };
      return row.n;
    });
  }

  save(entity: Class): void {
    guarded('SqliteClassRepository.save', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.classes}
           (id, institutionId, academicYearId, name, section, gradeLevel, capacity, isActive, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             institutionId = excluded.institutionId,
             academicYearId = excluded.academicYearId,
             name = excluded.name,
             section = excluded.section,
             gradeLevel = excluded.gradeLevel,
             capacity = excluded.capacity,
             isActive = excluded.isActive,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          entity.id,
          entity.institutionId,
          entity.academicYearId,
          entity.name,
          entity.section ?? null,
          entity.gradeLevel,
          entity.capacity ?? null,
          entity.isActive ? 1 : 0,
          entity.version,
          entity.updatedAt,
          entity.lastModifiedBy ?? null,
        );
    });
  }
}
