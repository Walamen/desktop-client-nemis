import { Subject } from '@nemis-desktop/domain';
import type {
  AssignClassSubjectInput,
  ClassSubjectLink,
  ISubjectRepository,
  SubjectPage,
  SubjectPageFilter,
} from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface SubjectRow {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  description: string | null;
  isActive: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toSubject(row: SubjectRow): Subject {
  return Subject.reconstitute({
    id: row.id,
    institutionId: row.institutionId,
    name: row.name,
    code: row.code,
    description: row.description ?? undefined,
    isActive: row.isActive === 1,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, name, code, description, isActive, version, updatedAt, lastModifiedBy';

const SORT_COLUMNS: Record<NonNullable<SubjectPageFilter['sort']>, string> = {
  name: 'name',
  code: 'code',
  updatedAt: 'updatedAt',
};

interface ClassSubjectRow {
  classId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  assignedAt: string;
}

function toLink(row: ClassSubjectRow): ClassSubjectLink {
  return {
    classId: row.classId,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    subjectCode: row.subjectCode,
    assignedAt: row.assignedAt,
  };
}

/** SQLite adapter for ISubjectRepository, including the class_subjects
 * assignment join table. */
export class SqliteSubjectRepository implements ISubjectRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): Subject | null {
    return guarded('SqliteSubjectRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.subjects} WHERE id = ? LIMIT 1`)
        .get(id) as SubjectRow | undefined;
      return row ? toSubject(row) : null;
    });
  }

  findPage(filter: SubjectPageFilter): SubjectPage {
    return guarded('SqliteSubjectRepository.findPage', () => {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (!filter.includeInactive) clauses.push('isActive = 1');
      if (filter.keyword) {
        clauses.push('(name LIKE ? OR code LIKE ?)');
        params.push(`%${filter.keyword}%`, `%${filter.keyword}%`);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const orderBy = SORT_COLUMNS[filter.sort ?? 'name'];

      const total = (
        this.#statements
          .get(`SELECT COUNT(*) AS n FROM ${TableNames.subjects} ${where}`)
          .get(...params) as { n: number }
      ).n;

      const rows = this.#statements
        .get(
          `SELECT ${COLUMNS} FROM ${TableNames.subjects} ${where}
           ORDER BY ${orderBy} ASC LIMIT ? OFFSET ?`,
        )
        .all(...params, filter.limit, filter.offset) as SubjectRow[];

      return { items: rows.map(toSubject), total };
    });
  }

  existsByCode(institutionId: string, code: string, excludeId?: string): boolean {
    return guarded('SqliteSubjectRepository.existsByCode', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.subjects}
           WHERE institutionId = ? AND code = ? AND id != ? LIMIT 1`,
        )
        .get(institutionId, code, excludeId ?? '');
      return row !== undefined;
    });
  }

  countAll(): number {
    return guarded('SqliteSubjectRepository.countAll', () => {
      const row = this.#statements
        .get(`SELECT COUNT(*) AS n FROM ${TableNames.subjects} WHERE isActive = 1`)
        .get() as { n: number };
      return row.n;
    });
  }

  countClasses(subjectId: string): number {
    return guarded('SqliteSubjectRepository.countClasses', () => {
      const row = this.#statements
        .get(`SELECT COUNT(*) AS n FROM ${TableNames.classSubjects} WHERE subjectId = ?`)
        .get(subjectId) as { n: number };
      return row.n;
    });
  }

  save(subject: Subject): void {
    guarded('SqliteSubjectRepository.save', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.subjects}
           (id, institutionId, name, code, description, isActive, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             institutionId = excluded.institutionId,
             name = excluded.name,
             code = excluded.code,
             description = excluded.description,
             isActive = excluded.isActive,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          subject.id,
          subject.institutionId,
          subject.name,
          subject.code,
          subject.description ?? null,
          subject.isActive ? 1 : 0,
          subject.version,
          subject.updatedAt,
          subject.lastModifiedBy ?? null,
        );
    });
  }

  listClassSubjects(classId: string): ClassSubjectLink[] {
    return guarded('SqliteSubjectRepository.listClassSubjects', () => {
      const rows = this.#statements
        .get(
          `SELECT cs.classId AS classId, cs.subjectId AS subjectId, s.name AS subjectName,
                  s.code AS subjectCode, cs.assignedAt AS assignedAt
           FROM ${TableNames.classSubjects} cs
           JOIN ${TableNames.subjects} s ON s.id = cs.subjectId
           WHERE cs.classId = ?
           ORDER BY s.name ASC`,
        )
        .all(classId) as ClassSubjectRow[];
      return rows.map(toLink);
    });
  }

  isAssigned(classId: string, subjectId: string): boolean {
    return guarded('SqliteSubjectRepository.isAssigned', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.classSubjects} WHERE classId = ? AND subjectId = ? LIMIT 1`,
        )
        .get(classId, subjectId);
      return row !== undefined;
    });
  }

  assign(link: AssignClassSubjectInput): void {
    guarded('SqliteSubjectRepository.assign', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.classSubjects}
           (id, classId, subjectId, assignedAt, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, 1, ?, NULL, NULL)`,
        )
        .run(link.id, link.classId, link.subjectId, link.assignedAt, link.assignedAt);
    });
  }

  unassign(classId: string, subjectId: string): void {
    guarded('SqliteSubjectRepository.unassign', () => {
      this.#statements
        .get(`DELETE FROM ${TableNames.classSubjects} WHERE classId = ? AND subjectId = ?`)
        .run(classId, subjectId);
    });
  }
}
