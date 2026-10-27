import { randomUUID } from 'node:crypto';
import { ForbiddenError } from '@nemis-desktop/shared';
import { DesktopScopeType, SystemRole } from '@nemis-desktop/types';
import type { YearStructureCopyRequest, YearStructureCopyResult } from '@nemis-desktop/types';
import { ValidationError, YearStructureNotEmptyError } from '@app/data/errors/repositoryErrors';
import type { WorkspaceManager } from '@app/workspace/WorkspaceManager';

const REFUSAL = 'Copy only into a year that is being set up and has no terms or classes yet.';
const refusal = () => new YearStructureNotEmptyError(REFUSAL);
const MS_PER_DAY = 86_400_000;

interface YearRow {
  id: string;
  institutionId: string;
  startDate: string;
  status: string;
}

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function dayNumber(date: string): number {
  const m = DATE_PREFIX.exec(date);
  if (!m) throw new ValidationError(`Unreadable date "${date}".`, [{ field: 'date', message: 'Unreadable date.' }]);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}

/** Moves the calendar-date prefix of an ISO date or date-time by whole days,
 * leaving any time suffix as it was. */
function shiftDate(date: string, days: number): string {
  if (days === 0) return date;
  const moved = new Date((dayNumber(date) + days) * MS_PER_DAY).toISOString().slice(0, 10);
  return moved + date.slice(10);
}

/**
 * Copies one year's structure (active classes, their subjects and teacher
 * assignments, terms, grading periods) into a year that is still being set up
 * (lifecycle Stage 4). Works offline: every row is written with capture on, so
 * the existing outbox triggers queue it for the server like any other setup
 * edit. Inserts run parents first (classes, terms, grading periods, then the
 * rows that point at them) so the queue replays in dependency order. No grade
 * windows, enrolments, grades, attendance or assignments are copied.
 */
export class YearStructureCopyService {
  constructor(private readonly workspaces: WorkspaceManager) {}

  copyStructure(request: YearStructureCopyRequest): YearStructureCopyResult {
    const active = this.workspaces.active;
    if (
      active.user.role !== SystemRole.INSTITUTION_ADMIN ||
      active.user.scope.type !== DesktopScopeType.INSTITUTION
    ) {
      throw new ForbiddenError('Only a school administrator can copy a year structure.');
    }
    const institutionId = active.user.scope.scopeId;
    const userId = active.user.id;
    const db = active.database.connection;

    return db.transaction((): YearStructureCopyResult => {
      const getYear = db.prepare(`SELECT id, institutionId, startDate, status FROM academic_years WHERE id = ?`);
      const target = getYear.get(request.targetYearId) as YearRow | undefined;
      const source = getYear.get(request.sourceYearId) as YearRow | undefined;
      if (
        !target || target.institutionId !== institutionId || target.status !== 'SETUP' ||
        !source || source.institutionId !== institutionId || source.id === target.id || source.status === 'SETUP'
      ) {
        throw refusal();
      }
      const has = (table: string) =>
        db.prepare(`SELECT 1 FROM ${table} WHERE academicYearId = ? LIMIT 1`).get(target.id) !== undefined;
      if (has('terms') || has('classes')) throw refusal();

      const offset = dayNumber(target.startDate) - dayNumber(source.startDate);
      const now = new Date().toISOString();

      const classes = db
        .prepare(
          `SELECT id, name, section, gradeLevel, capacity FROM classes
            WHERE academicYearId = ? AND institutionId = ? AND isActive = 1 ORDER BY name`,
        )
        .all(source.id, institutionId) as {
          id: string; name: string; section: string | null; gradeLevel: string; capacity: number | null;
        }[];
      const classIds = new Map<string, string>();
      const insertClass = db.prepare(
        `INSERT INTO classes
           (id, institutionId, academicYearId, name, section, gradeLevel, capacity, isActive, version, updatedAt, lastModifiedBy, deviceId)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, NULL)`,
      );
      for (const c of classes) {
        const id = randomUUID();
        classIds.set(c.id, id);
        insertClass.run(id, institutionId, target.id, c.name, c.section, c.gradeLevel, c.capacity, now, userId);
      }

      const terms = db
        .prepare(`SELECT id, name, sequence, startDate, endDate FROM terms WHERE academicYearId = ? ORDER BY startDate, name`)
        .all(source.id) as { id: string; name: string; sequence: number | null; startDate: string; endDate: string }[];
      // Sequence must be unique per year on the server; fall back to the date
      // order when the source terms do not all carry a distinct one.
      const sequences = terms.map((t) => t.sequence);
      const useSource =
        sequences.every((s): s is number => s !== null) && new Set(sequences).size === sequences.length;
      const termIds = new Map<string, string>();
      const insertTerm = db.prepare(
        `INSERT INTO terms
           (id, academicYearId, name, sequence, startDate, endDate, isCurrent, version, updatedAt, lastModifiedBy, deviceId)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, NULL)`,
      );
      terms.forEach((t, index) => {
        const id = randomUUID();
        termIds.set(t.id, id);
        insertTerm.run(
          id, target.id, t.name, useSource ? t.sequence : index + 1,
          shiftDate(t.startDate, offset), shiftDate(t.endDate, offset), now, userId,
        );
      });

      const periods = db
        .prepare(
          `SELECT termId, name, code, periodType, sequence, maxMarks, passingMarks, weight, startDate, endDate, isActive
             FROM grading_periods WHERE academicYearId = ? AND institutionId = ? ORDER BY sequence, code`,
        )
        .all(source.id, institutionId) as {
          termId: string; name: string; code: string; periodType: string; sequence: number; maxMarks: number;
          passingMarks: number; weight: number | null; startDate: string; endDate: string; isActive: number;
        }[];
      const insertPeriod = db.prepare(
        `INSERT INTO grading_periods
           (id, institutionId, academicYearId, termId, name, code, periodType, sequence, maxMarks, passingMarks,
            weight, startDate, endDate, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      let gradingPeriods = 0;
      for (const p of periods) {
        const termId = termIds.get(p.termId);
        if (!termId) continue; // a period whose term is not in the source year has nothing to hang on
        insertPeriod.run(
          randomUUID(), institutionId, target.id, termId, p.name, p.code, p.periodType, p.sequence, p.maxMarks,
          p.passingMarks, p.weight, shiftDate(p.startDate, offset), shiftDate(p.endDate, offset), p.isActive, now, now,
        );
        gradingPeriods += 1;
      }

      const sourceClassIds = [...classIds.keys()];
      const forClasses = sourceClassIds.map(() => '?').join(',');
      if (sourceClassIds.length > 0) {
        const insertClassSubject = db.prepare(
          `INSERT INTO class_subjects (id, classId, subjectId, assignedAt, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, 1, ?, ?, NULL)`,
        );
        for (const row of db
          .prepare(
            `SELECT cs.classId, cs.subjectId FROM class_subjects cs
               JOIN subjects sub ON sub.id = cs.subjectId
              WHERE cs.classId IN (${forClasses}) AND sub.isActive = 1`,
          )
          .all(...sourceClassIds) as { classId: string; subjectId: string }[]) {
          insertClassSubject.run(randomUUID(), classIds.get(row.classId)!, row.subjectId, now, now, userId);
        }

        const insertClassTeacher = db.prepare(
          `INSERT INTO class_teachers (id, classId, staffId, isClassTeacher, assignedAt, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        );
        for (const row of db
          .prepare(
            `SELECT ct.classId, ct.staffId, ct.isClassTeacher FROM class_teachers ct
               JOIN staff s ON s.id = ct.staffId
              WHERE ct.classId IN (${forClasses}) AND s.isActive = 1`,
          )
          .all(...sourceClassIds) as { classId: string; staffId: string; isClassTeacher: number }[]) {
          insertClassTeacher.run(
            randomUUID(), classIds.get(row.classId)!, row.staffId, row.isClassTeacher, now, now, userId,
          );
        }

        const insertTeaching = db.prepare(
          `INSERT INTO class_subject_teachers (id, classId, subjectId, staffId, assignedAt, version, updatedAt, lastModifiedBy, deviceId)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        );
        for (const row of db
          .prepare(
            `SELECT cst.classId, cst.subjectId, cst.staffId FROM class_subject_teachers cst
               JOIN staff s ON s.id = cst.staffId
               JOIN subjects sub ON sub.id = cst.subjectId
              WHERE cst.classId IN (${forClasses}) AND s.isActive = 1 AND sub.isActive = 1`,
          )
          .all(...sourceClassIds) as { classId: string; subjectId: string; staffId: string }[]) {
          insertTeaching.run(randomUUID(), classIds.get(row.classId)!, row.subjectId, row.staffId, now, now, userId);
        }
      }

      return { classes: classes.length, terms: terms.length, gradingPeriods };
    })();
  }
}
