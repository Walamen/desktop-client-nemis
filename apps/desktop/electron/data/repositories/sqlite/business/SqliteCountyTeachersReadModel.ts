import type {
  CountyTeacherDetail,
  CountyTeacherInstitution,
  CountyTeacherListItem,
  CountyTeachersQuery,
  CountyTeachersResult,
} from '@nemis-desktop/types';
import type { ICountyTeachersReadModel } from '@nemis-desktop/application';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

/** This county's own schools; with no county row synced (older server), all. */
const OWN_COUNTY = `(NOT EXISTS (SELECT 1 FROM counties) OR i.countyId IN (SELECT id FROM counties))`;
/** Teaching staff, the server's getTeachingPositions(). */
const TEACHING = `t.position IN ('TEACHER','ASSISTANT_TEACHER')`;
/** The list and the stats: teaching staff at the county's ACTIVE schools. */
const BASE = `i.isActive = 1 AND ${OWN_COUNTY} AND ${TEACHING}`;
/** Both ways a subject reaches a teacher: their own list, and a class they teach it in. */
const TEACHER_SUBJECTS = `SELECT staffId, subjectId, assignedAt FROM subject_teachers
                          UNION ALL SELECT staffId, subjectId, assignedAt FROM class_subject_teachers`;
/** A class at the teacher's own school in its current academic year, by either kind of assignment. */
const HAS_CLASS_THIS_YEAR = `EXISTS (
  SELECT 1 FROM (SELECT staffId, classId FROM class_teachers UNION ALL SELECT staffId, classId FROM class_subject_teachers) a
  JOIN classes c ON c.id = a.classId
  JOIN academic_years y ON y.id = c.academicYearId
  WHERE a.staffId = t.id AND c.institutionId = t.institutionId AND y.isCurrent = 1)`;

/** Array strings, or the `{ summary }` the desktop teacher form saves; else nothing. */
function qualificationList(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === 'string');
  if (parsed && typeof parsed === 'object') {
    const summary = (parsed as { summary?: unknown }).summary;
    if (typeof summary === 'string' && summary.trim()) return [summary];
  }
  return [];
}

/** The first of the school's levels, as the web takes `levels[0]`. */
function firstLevel(profile: string | null): string | null {
  if (!profile) return null;
  try {
    const levels = (JSON.parse(profile) as { levels?: unknown } | null)?.levels;
    return Array.isArray(levels) && typeof levels[0] === 'string' ? levels[0] : null;
  } catch {
    return null;
  }
}

type TeacherRow = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  photoUrl: string | null;
  employeeNumber: string;
  position: string;
  isActive: number;
  gender: string;
  institutionId: string;
  institutionName: string;
  profile: string | null;
  districtName: string | null;
  countyName: string | null;
};

type DetailRow = TeacherRow & {
  phoneNumber: string | null;
  email: string | null;
  employmentType: string | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  address: string | null;
  dateOfJoining: string | null;
  dateOfLeaving: string | null;
  qualifications: string | null;
};

const TEACHER_COLUMNS = `t.id, t.firstName, t.lastName, t.middleName, t.photoUrl, t.employeeNumber, t.position, t.isActive,
  t.gender, i.id AS institutionId, i.name AS institutionName, i.profile,
  (SELECT d.name FROM districts d WHERE d.id = i.districtId) AS districtName,
  (SELECT c.name FROM counties c WHERE c.id = i.countyId) AS countyName`;

/** SQLite read model for the County Teachers list and teacher profile
 * (docs/superpowers/specs/2026-10-18-county-teachers-design.md §5). */
export class SqliteCountyTeachersReadModel implements ICountyTeachersReadModel {
  readonly #statements: StatementCache;
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
    this.#statements = new StatementCache(repository.connection);
  }

  listTeachers(query: CountyTeachersQuery): Omit<CountyTeachersResult, 'county'> {
    return guarded('SqliteCountyTeachersReadModel.listTeachers', () => {
      const where: string[] = [BASE];
      const params: unknown[] = [];
      if (query.search) {
        where.push(`(t.firstName LIKE ? OR t.lastName LIKE ? OR t.employeeNumber LIKE ?)`);
        const term = `%${query.search}%`;
        params.push(term, term, term);
      }
      if (query.category && query.category !== 'all') {
        where.push(`CASE WHEN json_valid(i.profile)
                      THEN EXISTS (SELECT 1 FROM json_each(i.profile, '$.levels') WHERE value = ?) ELSE 0 END`);
        params.push(query.category);
      }
      if (query.status === 'active') where.push('t.isActive = 1');
      if (query.status === 'inactive') where.push('t.isActive = 0');
      if (query.subject && query.subject !== 'all') {
        where.push(`EXISTS (SELECT 1 FROM (${TEACHER_SUBJECTS}) ts JOIN subjects sj ON sj.id = ts.subjectId
                     WHERE ts.staffId = t.id AND lower(trim(sj.name)) = lower(trim(?)))`);
        params.push(query.subject);
      }
      const from = `FROM staff t JOIN institutions i ON i.id = t.institutionId WHERE ${where.join(' AND ')}`;
      const db = this.#repository.connection;
      const { total } = db.prepare(`SELECT COUNT(*) AS total ${from}`).get(...params) as { total: number };
      const page = Math.max(query.page ?? 1, 1);
      const limit = query.limit ?? 12;
      const rows = db
        .prepare(
          `SELECT ${TEACHER_COLUMNS} ${from}
           ORDER BY t.lastName ASC, t.firstName ASC, t.id ASC LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, (page - 1) * limit) as TeacherRow[];
      return {
        stats: this.#stats(),
        data: rows.map((row) => this.#listItem(row)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    });
  }

  #stats(): CountyTeachersResult['stats'] {
    const counts = this.#statements
      .get(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN t.isActive = 1 THEN 1 ELSE 0 END), 0) AS active,
                COALESCE(SUM(CASE WHEN t.isActive = 0 THEN 1 ELSE 0 END), 0) AS inactive,
                COALESCE(SUM(CASE WHEN t.isActive = 1 AND NOT ${HAS_CLASS_THIS_YEAR} THEN 1 ELSE 0 END), 0) AS unassigned
         FROM staff t JOIN institutions i ON i.id = t.institutionId WHERE ${BASE}`,
      )
      .get() as Omit<CountyTeachersResult['stats'], 'subjects'>;
    // One entry per name group (case, surrounding spaces); the lowest spelling shows.
    const names = this.#statements
      .get(
        `SELECT MIN(trim(sj.name)) AS name
         FROM (${TEACHER_SUBJECTS}) ts
         JOIN subjects sj ON sj.id = ts.subjectId
         JOIN staff t ON t.id = ts.staffId
         JOIN institutions i ON i.id = t.institutionId
         WHERE ${BASE}
         GROUP BY lower(trim(sj.name))`,
      )
      .all() as Array<{ name: string }>;
    return { ...counts, subjects: names.map((row) => row.name).sort((a, b) => a.localeCompare(b)) };
  }

  /** One per subject, at its earliest assignment, by that date then name. */
  #subjects(staffId: string): Array<{ id: string; name: string; code: string | null }> {
    return this.#statements
      .get(
        `SELECT sj.id, sj.name, sj.code
         FROM (SELECT subjectId, MIN(assignedAt) AS at FROM (${TEACHER_SUBJECTS}) WHERE staffId = ? GROUP BY subjectId) x
         JOIN subjects sj ON sj.id = x.subjectId
         ORDER BY x.at ASC, sj.name ASC`,
      )
      .all(staffId) as Array<{ id: string; name: string; code: string | null }>;
  }

  #institution(row: TeacherRow): CountyTeacherInstitution {
    return {
      id: row.institutionId,
      name: row.institutionName,
      level: firstLevel(row.profile),
      districtName: row.districtName,
      countyName: row.countyName,
    };
  }

  #listItem(row: TeacherRow, subjects = this.#subjects(row.id)): CountyTeacherListItem {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      middleName: row.middleName,
      photoUrl: row.photoUrl,
      employeeNumber: row.employeeNumber,
      position: row.position,
      isActive: row.isActive === 1,
      gender: row.gender,
      institution: this.#institution(row),
      primarySubject: subjects[0]?.name ?? null,
    };
  }

  getTeacher(id: string): CountyTeacherDetail | null {
    return guarded('SqliteCountyTeachersReadModel.getTeacher', () => {
      // Any position, any school in the county (active or not), as the web profile.
      const row = this.#statements
        .get(
          `SELECT ${TEACHER_COLUMNS}, t.phoneNumber, t.email, t.employmentType, t.dateOfBirth, t.nationalId, t.address,
                  t.dateOfJoining, t.dateOfLeaving, t.qualifications
           FROM staff t JOIN institutions i ON i.id = t.institutionId
           WHERE t.id = ? AND ${OWN_COUNTY}`,
        )
        .get(id) as DetailRow | undefined;
      if (!row) return null;
      const subjects = this.#subjects(row.id);
      const classes = this.#statements
        .get(
          `SELECT ct.id, ct.isClassTeacher, c.id AS classId, c.name, c.gradeLevel
           FROM class_teachers ct JOIN classes c ON c.id = ct.classId
           WHERE ct.staffId = ? ORDER BY c.name ASC, ct.id ASC`,
        )
        .all(row.id) as Array<{ id: string; isClassTeacher: number; classId: string; name: string; gradeLevel: string }>;
      return {
        ...this.#listItem(row, subjects),
        phoneNumber: row.phoneNumber,
        email: row.email,
        employmentType: row.employmentType,
        dateOfBirth: row.dateOfBirth,
        nationalId: row.nationalId,
        address: row.address,
        dateOfJoining: row.dateOfJoining,
        dateOfLeaving: row.dateOfLeaving,
        qualifications: qualificationList(row.qualifications),
        classAssignments: classes.map((c) => ({
          id: c.id,
          isClassTeacher: c.isClassTeacher === 1,
          class: { id: c.classId, name: c.name, gradeLevel: c.gradeLevel },
        })),
        subjectAssignments: subjects.map((subject) => ({ id: subject.id, subject })),
      };
    });
  }
}
