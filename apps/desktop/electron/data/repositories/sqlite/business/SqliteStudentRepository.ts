import { Student, StudentGuardian } from '@nemis-desktop/domain';
import type { IStudentRepository, StudentPageFilter } from '@nemis-desktop/application';
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
  admissionDate: string | null;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
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
    admissionDate: row.admissionDate ?? undefined,
    phoneNumber: row.phoneNumber ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    version: row.version,
    updatedAt: row.updatedAt,
    lastModifiedBy: row.lastModifiedBy ?? undefined,
  });
}

const COLUMNS =
  'id, institutionId, firstName, middleName, lastName, admissionNumber, dateOfBirth, gender, gradeLevel, admissionDate, phoneNumber, email, address, isActive, version, updatedAt, lastModifiedBy';

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
      if (!row) return null;
      const student = toStudent(row);
      const links = this.#statements.get(`SELECT id, guardianId, isPrimary FROM ${TableNames.studentGuardians} WHERE studentId = ?`).all(id) as { id: string; guardianId: string; isPrimary: number }[];
      return Student.reconstitute({ id: student.id, institutionId: student.institutionId, firstName: student.name.firstName, middleName: student.name.middleName, lastName: student.name.lastName, admissionNumber: student.admissionNumber.value, dateOfBirth: student.dateOfBirth.value, gender: student.gender, gradeLevel: student.gradeLevel, admissionDate: student.admissionDate, phoneNumber: student.phoneNumber, email: student.email, address: student.address, isActive: student.isActive, guardians: links.map((link) => StudentGuardian.reconstitute({ id: link.id, guardianId: link.guardianId, isPrimary: link.isPrimary === 1 })), version: student.version, updatedAt: student.updatedAt, lastModifiedBy: student.lastModifiedBy });
    });
  }

  save(student: Student): void {
    guarded('SqliteStudentRepository.save', () => {
      this.#statements
        .get(
          `INSERT INTO ${TableNames.students}
           (id, institutionId, firstName, middleName, lastName, admissionNumber, dateOfBirth, gender, gradeLevel, admissionDate, phoneNumber, email, address, isActive, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             institutionId = excluded.institutionId,
             firstName = excluded.firstName,
             middleName = excluded.middleName,
             lastName = excluded.lastName,
             admissionNumber = excluded.admissionNumber,
             dateOfBirth = excluded.dateOfBirth,
             gender = excluded.gender,
             gradeLevel = excluded.gradeLevel,
             admissionDate = excluded.admissionDate,
             phoneNumber = excluded.phoneNumber,
             email = excluded.email,
             address = excluded.address,
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
          student.admissionDate ?? null,
          student.phoneNumber ?? null,
          student.email ?? null,
          student.address ?? null,
          student.isActive ? 1 : 0,
          student.version,
          student.updatedAt,
          student.lastModifiedBy ?? null,
        );
      const link = this.#statements.get(`INSERT INTO ${TableNames.studentGuardians} (id, studentId, guardianId, isPrimary, createdAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(studentId, guardianId) DO UPDATE SET isPrimary = excluded.isPrimary`);
      for (const guardian of student.guardians) link.run(guardian.id, student.id, guardian.guardianId, guardian.isPrimary ? 1 : 0, student.updatedAt);
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

  existsByAdmissionNumber(institutionId: string, admissionNumber: string, excludeId?: string): boolean {
    return guarded('SqliteStudentRepository.existsByAdmissionNumber', () => {
      const row = this.#statements
        .get(
          `SELECT id FROM ${TableNames.students} WHERE institutionId = ? AND admissionNumber = ? ${excludeId ? 'AND id <> ?' : ''} LIMIT 1`,
        )
        .get(...(excludeId ? [institutionId, admissionNumber, excludeId] : [institutionId, admissionNumber]));
      return row !== undefined;
    });
  }

  findPage(request: StudentPageFilter): { items: Student[]; total: number } {
    return guarded('SqliteStudentRepository.findPage', () => {
      const clauses: string[] = []; const params: unknown[] = [];
      if (request.keyword) { clauses.push('(s.firstName LIKE ? OR s.lastName LIKE ? OR s.admissionNumber LIKE ?)'); const q = `%${request.keyword}%`; params.push(q, q, q); }
      if (request.gender) { clauses.push('s.gender = ?'); params.push(request.gender); }
      if (request.gradeLevel) { clauses.push('s.gradeLevel = ?'); params.push(request.gradeLevel); }
      if (request.isActive !== undefined) { clauses.push('s.isActive = ?'); params.push(request.isActive ? 1 : 0); }
      if (request.classId) { clauses.push('e.classId = ?'); params.push(request.classId); }
      if (request.academicYearId) { clauses.push('e.academicYearId = ?'); params.push(request.academicYearId); }
      if (request.enrollmentStatus) { clauses.push('e.status = ?'); params.push(request.enrollmentStatus); }
      const join = request.classId || request.academicYearId || request.enrollmentStatus ? ` JOIN ${TableNames.enrollments} e ON e.studentId = s.id` : '';
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      const order = request.sort === 'name' ? 's.lastName ASC, s.firstName ASC' : request.sort === 'admissionNumber' ? 's.admissionNumber ASC' : 's.updatedAt DESC, s.id ASC';
      const rows = this.#statements
        .get(`SELECT DISTINCT ${COLUMNS.split(', ').map((c) => `s.${c}`).join(', ')} FROM ${TableNames.students} s${join}${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .all(...params, request.limit, request.offset) as StudentRow[];
      const totalRow = this.#statements.get(`SELECT COUNT(DISTINCT s.id) AS n FROM ${TableNames.students} s${join}${where}`).get(...params) as { n: number };
      const total = totalRow.n;
      return { items: rows.map(toStudent), total };
    });
  }

  // IStudentRepository declares findByClassId(classId); TS lets the impl omit
  // the unused param. No class↔student link table exists this phase.
  findByClassId(): Student[] {
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
  countByGradeLevel(): { gradeLevel: GradeLevel; studentCount: number }[] {
    return guarded('SqliteStudentRepository.countByGradeLevel', () => this.#statements.get(`SELECT gradeLevel, COUNT(*) AS studentCount FROM ${TableNames.students} WHERE isActive = 1 AND gradeLevel IS NOT NULL GROUP BY gradeLevel`).all() as { gradeLevel: GradeLevel; studentCount: number }[]);
  }
  findRecentlyUpdated(limit: number): Student[] {
    return guarded('SqliteStudentRepository.findRecentlyUpdated', () => (this.#statements.get(`SELECT ${COLUMNS} FROM ${TableNames.students} ORDER BY updatedAt DESC LIMIT ?`).all(limit) as StudentRow[]).map(toStudent));
  }
}
