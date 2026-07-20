import { Student } from '@nemis-desktop/domain';
import type { IStudentRepository, PageRequest } from '@nemis-desktop/application';
import type { Gender, GradeLevel } from '@nemis-desktop/types';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface StudentRow {
  id: string;
  institutionId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: string;
  gradeLevel: string | null;
  isActive: number;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}

function toStudent(row: StudentRow): Student {
  return Student.reconstitute({
    id: row.id,
    institutionId: row.institutionId,
    firstName: row.firstName,
    middleName: row.middleName ?? undefined,
    lastName: row.lastName,
    admissionNumber: row.admissionNumber,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender as Gender,
    gradeLevel: (row.gradeLevel ?? undefined) as GradeLevel | undefined,
    isActive: row.isActive === 1,
    guardians: [],
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, firstName, middleName, lastName, admissionNumber, dateOfBirth, gender, gradeLevel, isActive, version, updatedAt, lastModifiedBy';

/** SQLite adapter for IStudentRepository. Guardians are not persisted this
 * phase (no guardian tables yet); students reconstitute with an empty guardian
 * list, which is all the dashboard read path needs. */
export class SqliteStudentRepository implements IStudentRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findById(id: string): Student | null {
    return guarded('SqliteStudentRepository.findById', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${TableNames.students} WHERE id = ? LIMIT 1`)
        .get(id) as StudentRow | undefined;
      return row ? toStudent(row) : null;
    });
  }

  save(student: Student): void {
    guarded('SqliteStudentRepository.save', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.students}
           (id, institutionId, firstName, middleName, lastName, admissionNumber, dateOfBirth, gender, gradeLevel, isActive, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             institutionId = excluded.institutionId,
             firstName = excluded.firstName,
             middleName = excluded.middleName,
             lastName = excluded.lastName,
             admissionNumber = excluded.admissionNumber,
             dateOfBirth = excluded.dateOfBirth,
             gender = excluded.gender,
             gradeLevel = excluded.gradeLevel,
             isActive = excluded.isActive,
             version = excluded.version,
             updatedAt = excluded.updatedAt,
             lastModifiedBy = excluded.lastModifiedBy`,
        )
        .run(
          student.id,
          student.institutionId,
          student.name.firstName,
          student.name.middleName ?? null,
          student.name.lastName,
          student.admissionNumber.value,
          student.dateOfBirth.value,
          student.gender,
          student.gradeLevel ?? null,
          student.isActive ? 1 : 0,
          student.version,
          student.updatedAt,
          student.lastModifiedBy ?? null,
        );
    });
  }

  exists(id: string): boolean {
    return guarded('SqliteStudentRepository.exists', () => {
      const row = this.#statements
        .get(`SELECT id FROM ${TableNames.students} WHERE id = ? LIMIT 1`)
        .get(id);
      return row !== undefined;
    });
  }

  existsByAdmissionNumber(institutionId: string, admissionNumber: string): boolean {
    return guarded('SqliteStudentRepository.existsByAdmissionNumber', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.students} WHERE institutionId = ? AND admissionNumber = ? LIMIT 1`,
        )
        .get(institutionId, admissionNumber);
      return row !== undefined;
    });
  }

  findPage(request: PageRequest): { items: Student[]; total: number } {
    return guarded('SqliteStudentRepository.findPage', () => {
      const rows = this.#statements
        .get(
          `SELECT ${COLUMNS} FROM ${TableNames.students} ORDER BY updatedAt DESC, id ASC LIMIT ? OFFSET ?`,
        )
        .all(request.limit, request.offset) as StudentRow[];
      const total = this.countAll();
      return { items: rows.map(toStudent), total };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- IStudentRepository requires the param; no class-student link table exists this phase.
  findByClassId(_classId: string): Student[] {
    // No class↔student link table exists this phase; enrollment arrives later.
    return [];
  }

  countAll(): number {
    return guarded('SqliteStudentRepository.countAll', () => {
      const row = this.#statements
        .get(`SELECT COUNT(*) AS n FROM ${TableNames.students}`)
        .get() as { n: number };
      return row.n;
    });
  }
}
