import { TimetableEntry } from '@nemis-desktop/domain';
import type { ITimetableRepository, TimetablePageFilter } from '@nemis-desktop/application';
import type {
  CopyTimetableRequest,
  DayOfWeek,
  GradeLevel,
  PeriodResult,
  ScheduleConflictResult,
  TimetableDashboardResult,
  TimetableEntryResult,
} from '@nemis-desktop/types';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface EntryRow {
  id: string; institutionId: string; classId: string; subjectId: string | null;
  staffId: string | null; assignmentId: string | null; dayOfWeek: DayOfWeek;
  startTime: string; endTime: string; room: string | null; isBreak: number;
  createdAt: string; updatedAt: string; version: number;
  academicYearId: string; academicYearName: string; className: string;
  section: string | null; gradeLevel: GradeLevel; subjectName: string | null;
  subjectCode: string | null; teacherName: string | null; employeeNumber: string | null;
}

const DAY_ORDER = `CASE t.dayOfWeek
  WHEN 'MONDAY' THEN 1 WHEN 'TUESDAY' THEN 2 WHEN 'WEDNESDAY' THEN 3
  WHEN 'THURSDAY' THEN 4 WHEN 'FRIDAY' THEN 5 WHEN 'SATURDAY' THEN 6 ELSE 7 END`;
const SELECT = `
  SELECT t.id,t.institutionId,t.classId,t.subjectId,t.staffId,t.assignmentId,t.dayOfWeek,
         t.startTime,t.endTime,t.room,t.isBreak,t.createdAt,t.updatedAt,t.version,
         c.academicYearId,y.code academicYearName,c.name className,c.section,c.gradeLevel,
         s.name subjectName,s.code subjectCode,
         CASE WHEN st.id IS NULL THEN NULL ELSE TRIM(st.firstName||' '||st.lastName) END teacherName,
         st.employeeNumber
    FROM timetable_entries t
    JOIN classes c ON c.id=t.classId
    JOIN academic_years y ON y.id=c.academicYearId
    LEFT JOIN subjects s ON s.id=t.subjectId
    LEFT JOIN staff st ON st.id=t.staffId`;

function toResult(row: EntryRow): TimetableEntryResult {
  return {
    ...row,
    subjectId: row.subjectId ?? undefined,
    staffId: row.staffId ?? undefined,
    assignmentId: row.assignmentId ?? undefined,
    room: row.room ?? undefined,
    isBreak: row.isBreak === 1,
    section: row.section ?? undefined,
    subjectName: row.subjectName ?? undefined,
    subjectCode: row.subjectCode ?? undefined,
    teacherName: row.teacherName ?? undefined,
    employeeNumber: row.employeeNumber ?? undefined,
  };
}

function toEntity(row: EntryRow): TimetableEntry {
  return TimetableEntry.reconstitute({
    id: row.id, institutionId: row.institutionId, classId: row.classId,
    subjectId: row.subjectId ?? undefined, staffId: row.staffId ?? undefined,
    assignmentId: row.assignmentId ?? undefined, dayOfWeek: row.dayOfWeek,
    startTime: row.startTime, endTime: row.endTime, room: row.room ?? undefined,
    isBreak: row.isBreak === 1, createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}

export class SqliteTimetableRepository implements ITimetableRepository {
  readonly #statements: StatementCache;
  readonly #transactions: RepositoryContext['transactions'];
  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
    this.#transactions = context.transactions;
  }

  findById(id: string): TimetableEntry | null {
    return guarded('SqliteTimetableRepository.findById', () => {
      const row = this.#statements.get(`${SELECT} WHERE t.id=? LIMIT 1`).get(id) as EntryRow | undefined;
      return row ? toEntity(row) : null;
    });
  }

  findPage(filter: TimetablePageFilter): { items: TimetableEntryResult[]; total: number } {
    return guarded('SqliteTimetableRepository.findPage', () => {
      const clauses: string[] = []; const params: unknown[] = [];
      if (filter.keyword) {
        const q = `%${filter.keyword}%`;
        clauses.push(`(c.name LIKE ? OR c.section LIKE ? OR s.name LIKE ? OR s.code LIKE ?
          OR st.firstName LIKE ? OR st.lastName LIKE ? OR t.room LIKE ?)`);
        params.push(q, q, q, q, q, q, q);
      }
      const fields = [
        ['academicYearId', 'c.academicYearId'], ['classId', 't.classId'],
        ['teacherId', 't.staffId'], ['subjectId', 't.subjectId'],
        ['gradeLevel', 'c.gradeLevel'], ['dayOfWeek', 't.dayOfWeek'],
      ] as const;
      for (const [key, column] of fields) {
        const value = filter[key];
        if (value) { clauses.push(`${column}=?`); params.push(value); }
      }
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      const order = filter.sort === 'class' ? 'c.name,c.section,t.startTime'
        : filter.sort === 'teacher' ? 'teacherName,t.dayOfWeek,t.startTime'
        : filter.sort === 'subject' ? 's.name,t.dayOfWeek,t.startTime'
        : filter.sort === 'updatedAt' ? 't.updatedAt DESC,t.id'
        : filter.sort === 'time' ? 't.startTime,t.dayOfWeek'
        : `${DAY_ORDER},t.startTime,c.name`;
      const rows = this.#statements.get(`${SELECT}${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .all(...params, filter.limit, filter.offset) as EntryRow[];
      const count = this.#statements.get(`
        SELECT COUNT(*) n FROM timetable_entries t JOIN classes c ON c.id=t.classId
        LEFT JOIN subjects s ON s.id=t.subjectId LEFT JOIN staff st ON st.id=t.staffId${where}`)
        .get(...params) as { n: number };
      return { items: rows.map(toResult), total: count.n };
    });
  }

  save(entry: TimetableEntry): TimetableEntryResult {
    return guarded('SqliteTimetableRepository.save', () => {
      const p = entry.data;
      const ownedClass = this.#statements.get(
        'SELECT id FROM classes WHERE id=? AND institutionId=? LIMIT 1',
      ).get(p.classId, p.institutionId);
      if (!ownedClass) throw new Error('Class does not belong to the selected school.');
      this.#statements.get(`
        INSERT INTO timetable_entries
          (id,institutionId,classId,subjectId,staffId,dayOfWeek,startTime,endTime,room,isBreak,
           assignmentId,createdAt,updatedAt,version)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)
        ON CONFLICT(id) DO UPDATE SET classId=excluded.classId,subjectId=excluded.subjectId,
          staffId=excluded.staffId,dayOfWeek=excluded.dayOfWeek,startTime=excluded.startTime,
          endTime=excluded.endTime,room=excluded.room,isBreak=excluded.isBreak,
          assignmentId=excluded.assignmentId,updatedAt=excluded.updatedAt,version=version+1`)
        .run(p.id,p.institutionId,p.classId,p.subjectId??null,p.staffId??null,p.dayOfWeek,
          p.startTime,p.endTime,p.room??null,p.isBreak?1:0,p.assignmentId??null,p.createdAt,p.updatedAt);
      const row = this.#statements.get(`${SELECT} WHERE t.id=?`).get(p.id) as EntryRow;
      return toResult(row);
    });
  }

  remove(id: string): void {
    guarded('SqliteTimetableRepository.remove', () => {
      this.#statements.get('DELETE FROM timetable_entries WHERE id=?').run(id);
    });
  }

  hasAssignment(classId: string, subjectId: string, staffId: string): boolean {
    return this.#statements.get(`
      SELECT id FROM class_subject_teachers
      WHERE classId=? AND subjectId=? AND staffId=? LIMIT 1`)
      .get(classId, subjectId, staffId) !== undefined;
  }

  detectConflicts(entry: TimetableEntry, excludeId?: string): ScheduleConflictResult[] {
    return guarded('SqliteTimetableRepository.detectConflicts', () => {
      const p = entry.data;
      const exclusion = excludeId ? ' AND t.id<>?' : '';
      const base = [p.dayOfWeek, p.endTime, p.startTime, ...(excludeId ? [excludeId] : [])];
      const rows = this.#statements.get(`
        ${SELECT} WHERE t.dayOfWeek=? AND t.startTime<? AND t.endTime>?${exclusion}
          AND (t.classId=? OR (? IS NOT NULL AND t.staffId=? AND t.isBreak=0))`)
        .all(...base, p.classId, p.staffId ?? null, p.staffId ?? null) as EntryRow[];
      const found: ScheduleConflictResult[] = [];
      for (const row of rows) {
        if (row.classId === p.classId) found.push({
          type: 'TIME_SLOT_CONFLICT',
          message: `${row.className} already has ${row.isBreak ? 'a break' : row.subjectName ?? 'a lesson'} from ${row.startTime} to ${row.endTime}.`,
          conflictingEntryId: row.id, dayOfWeek: p.dayOfWeek,
          startTime: p.startTime, endTime: p.endTime,
        });
        else if (!p.isBreak && p.staffId && row.staffId === p.staffId) found.push({
          type: 'TEACHER_CONFLICT',
          message: `${row.teacherName ?? 'This teacher'} is already teaching ${row.className} from ${row.startTime} to ${row.endTime}.`,
          conflictingEntryId: row.id, dayOfWeek: p.dayOfWeek,
          startTime: p.startTime, endTime: p.endTime,
        });
      }
      return found;
    });
  }

  copy(request: CopyTimetableRequest, ids: readonly string[], now: string): TimetableEntryResult[] {
    return guarded('SqliteTimetableRepository.copy', () => this.#transactions.runImmediate(() => {
      const source = this.findPage({ classId: request.sourceClassId, limit: 10_000, offset: 0, sort: 'day' }).items;
      const target = this.#statements.get('SELECT institutionId FROM classes WHERE id=? AND isActive=1')
        .get(request.targetClassId) as { institutionId: string } | undefined;
      if (!target) throw new Error('Destination class not found or inactive.');
      if (source.some((row) => row.institutionId !== target.institutionId)) {
        throw new Error('Source and destination classes must belong to the same school.');
      }
      const created: TimetableEntryResult[] = [];
      source.forEach((row, index) => {
        const destinationAssignment = row.isBreak || !row.subjectId ? undefined
          : this.#statements.get(`
              SELECT id,staffId FROM class_subject_teachers
              WHERE classId=? AND subjectId=? LIMIT 1`)
              .get(request.targetClassId,row.subjectId) as {id:string;staffId:string}|undefined;
        if (!row.isBreak && !destinationAssignment) throw new Error(
          `Teacher assignment is missing for ${row.subjectName ?? 'a subject'} in the destination class.`,
        );
        const entry = TimetableEntry.create({
          id: ids[index]!, institutionId: target.institutionId, classId: request.targetClassId,
          subjectId: row.subjectId, staffId: destinationAssignment?.staffId, assignmentId: undefined,
          dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime,
          room: row.room, isBreak: row.isBreak, createdAt: now, updatedAt: now,
        });
        const conflict = this.detectConflicts(entry);
        if (conflict.length) throw new Error(conflict.map((item) => item.message).join(' '));
        created.push(this.save(entry));
      });
      return created;
    }));
  }

  periods(classId?: string): PeriodResult[] {
    const rows = this.#statements.get(`
      SELECT startTime,endTime,MAX(isBreak) isBreak FROM timetable_entries
      ${classId ? 'WHERE classId=?' : ''} GROUP BY startTime,endTime ORDER BY startTime,endTime`)
      .all(...(classId ? [classId] : [])) as Array<{ startTime: string; endTime: string; isBreak: number }>;
    return rows.map((row, index) => ({ ...row, isBreak: row.isBreak === 1, order: index + 1 }));
  }

  dashboard(today: string): TimetableDashboardResult {
    const summary = this.#statements.get(`
      SELECT COUNT(*) totalEntries,COUNT(DISTINCT classId) classesWithSchedules,
        SUM(CASE WHEN dayOfWeek=? THEN 1 ELSE 0 END) todayEntries,
        COUNT(DISTINCT CASE WHEN dayOfWeek=? THEN classId END) classesScheduledToday
      FROM timetable_entries`).get(today, today) as {
        totalEntries: number; classesWithSchedules: number;
        todayEntries: number | null; classesScheduledToday: number;
      };
    const teacherWorkload = this.#statements.get(`
      SELECT t.staffId teacherId,TRIM(s.firstName||' '||s.lastName) teacherName,COUNT(*) lessons
      FROM timetable_entries t JOIN staff s ON s.id=t.staffId
      WHERE t.isBreak=0 GROUP BY t.staffId,s.firstName,s.lastName
      ORDER BY lessons DESC,teacherName LIMIT 8`).all() as TimetableDashboardResult['teacherWorkload'];
    const pendingConflicts = (this.#statements.get(`
      SELECT COUNT(*) n FROM timetable_entries a JOIN timetable_entries b ON a.id<b.id
      AND a.dayOfWeek=b.dayOfWeek AND a.startTime<b.endTime AND a.endTime>b.startTime
      AND (a.classId=b.classId OR (
        a.isBreak=0 AND b.isBreak=0 AND a.staffId IS NOT NULL AND a.staffId=b.staffId
      ))`).get() as { n:number }).n;
    return {
      totalEntries: summary.totalEntries,
      classesWithSchedules: summary.classesWithSchedules,
      todayEntries: summary.todayEntries ?? 0,
      classesScheduledToday: summary.classesScheduledToday,
      pendingConflicts,
      teacherWorkload,
    };
  }
}
