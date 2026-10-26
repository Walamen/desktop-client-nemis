import { ApplicationError, ForbiddenError } from '@nemis-desktop/shared';
import type {
  ReportCardArchivedYear,
  ReportCardClassEntry,
  ReportCardIssueDetail,
  ReportCardPayloadV1,
  ReportCardSummary,
} from '@nemis-desktop/types';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';
import { workspaceStudentScope } from './workspaceScope';

/** Who is reading. A school administrator sees every card the workspace's
 * school issued; a teacher (`teacherUserId` = their sign-in user id) sees only
 * the cards of classes they are assigned to, in any academic year. */
export interface ReportCardViewer {
  teacherUserId: string | null;
}

/** json_extract that yields NULL for a corrupt payload instead of raising, so
 * one bad row cannot break a whole list (COALESCE then falls back to the
 * live academic_years / classes / students rows). */
const jx = (column: string, path: string): string =>
  `CASE WHEN json_valid(${column}) THEN json_extract(${column}, '${path}') END`;

/** The stored payload of an issue is not valid JSON. Surfaces to the renderer
 * as IPC_ERROR with this (our own) message. */
export class ReportCardPayloadCorruptError extends ApplicationError {
  constructor(options?: { cause?: unknown }) {
    super('IPC_ERROR', 'This report card could not be read. It will be refreshed at the next sync.', options);
  }
}

/** A teacher's classes: class teacher or subject teacher, every year. */
const TEACHER_CLASSES = `
  SELECT ct.classId AS classId FROM class_teachers ct JOIN staff s ON s.id = ct.staffId WHERE s.userId = :teacherUserId
  UNION
  SELECT cst.classId AS classId FROM class_subject_teachers cst JOIN staff s ON s.id = cst.staffId WHERE s.userId = :teacherUserId`;

const SUMMARY_SELECT = `
  SELECT i.id AS issueId, i.reportCardId AS reportCardId, rc.studentId AS studentId,
         rc.academicYearId AS academicYearId,
         COALESCE(${jx('i.payload', '$.academicYear.name')}, ay.code) AS academicYearName,
         rc.classId AS classId,
         COALESCE(${jx('i.payload', '$.class.name')}, c.name) AS className,
         i.kind AS kind, COALESCE(${jx('i.payload', '$.issuedForPeriod.name')}, gp.name) AS gradingPeriodName,
         i.version AS version, i.status AS status, i.issuedAt AS issuedAt
  FROM report_card_issues i
  JOIN report_cards rc ON rc.id = i.reportCardId
  LEFT JOIN academic_years ay ON ay.id = rc.academicYearId
  LEFT JOIN classes c ON c.id = rc.classId
  LEFT JOIN grading_periods gp ON gp.id = i.gradingPeriodId
  LEFT JOIN terms t ON t.id = gp.termId`;

// Newest year first, then the grading periods in calendar order (a FINAL
// card, which has no period, after them), newest version first.
const SUMMARY_ORDER = `
  ORDER BY COALESCE(ay.startDate, '') DESC, rc.academicYearId, COALESCE(t.startDate, '9999'),
           COALESCE(gp.sequence, 9999), i.kind DESC, i.version DESC, i.id`;

/** Report cards for the desktop views. Always reads issues (never recomputes
 * a card) and enforces who may see what here, in the read model, so no
 * handler can forget it. */
export class SqliteReportCardReadModel {
  readonly #repository: Pick<RepositoryContext, 'connection'>;

  constructor(repository: Pick<RepositoryContext, 'connection'>) {
    this.#repository = repository;
  }

  /** Every issue of a student's cards. A teacher gets only the cards of their
   * classes, and is refused a student whose cards are all in other classes. */
  listForStudent(viewer: ReportCardViewer, studentId: string): ReportCardSummary[] {
    return guardedRead('SqliteReportCardReadModel.listForStudent', () => {
      const rows = this.#summaries(`rc.studentId = :studentId`, { studentId });
      if (viewer.teacherUserId === null) return rows;
      const taught = rows.filter((row) => this.#teaches(viewer, row.classId));
      if (rows.length > 0 && taught.length === 0) throw forbidden();
      return taught;
    });
  }

  /** One line per student holding a card for the class: their latest CURRENT issue. */
  listForClass(viewer: ReportCardViewer, classId: string): ReportCardClassEntry[] {
    return guardedRead('SqliteReportCardReadModel.listForClass', () => {
      if (viewer.teacherUserId !== null && !this.#teaches(viewer, classId)) throw forbidden();
      const cards = this.#repository.connection
        .prepare(
          `SELECT rc.id AS cardId, rc.studentId AS studentId,
                  COALESCE(s.nemisId, ${jx('latest.payload', '$.student.nemisId')}) AS nemisId,
                  COALESCE(s.firstName, ${jx('latest.payload', '$.student.firstName')}) AS firstName,
                  COALESCE(s.middleName, ${jx('latest.payload', '$.student.middleName')}) AS middleName,
                  COALESCE(s.lastName, ${jx('latest.payload', '$.student.lastName')}) AS lastName
           FROM report_cards rc
           LEFT JOIN students s ON s.id = rc.studentId
           LEFT JOIN report_card_issues latest ON latest.id = (
             SELECT x.id FROM report_card_issues x WHERE x.reportCardId = rc.id
             ORDER BY x.issuedAt DESC, x.version DESC, x.id LIMIT 1)
           WHERE rc.classId = ? AND ${workspaceStudentScope('rc')}
           ORDER BY lastName COLLATE NOCASE, firstName COLLATE NOCASE, rc.studentId`,
        )
        .all(classId) as {
        cardId: string;
        studentId: string;
        nemisId: string | null;
        firstName: string | null;
        middleName: string | null;
        lastName: string | null;
      }[];
      // "Latest" is the latest period of the year, not the latest issued: a
      // re-issue of an earlier period must not displace a later period's card.
      const positions = this.#periodPositions(classId);
      const latestByCard = new Map<string, ReportCardSummary>();
      for (const row of this.#summaries(`rc.classId = :classId AND i.status = 'CURRENT'`, { classId })) {
        const best = latestByCard.get(row.reportCardId);
        if (!best || isLater(row, best, positions)) latestByCard.set(row.reportCardId, row);
      }
      return cards.map((card) => ({
        student: {
          id: card.studentId,
          nemisId: card.nemisId,
          fullName: [card.firstName, card.middleName, card.lastName].filter(Boolean).join(' ') || 'Unknown student',
        },
        latest: latestByCard.get(card.cardId) ?? null,
      }));
    });
  }

  /** One issue with its payload. Missing, another school's and (for a
   * teacher) another class's issues are all refused alike. */
  getIssue(viewer: ReportCardViewer, issueId: string): ReportCardIssueDetail {
    return guardedRead('SqliteReportCardReadModel.getIssue', () => {
      const summary = this.#summaries(`i.id = :issueId`, { issueId })[0];
      if (!summary || (viewer.teacherUserId !== null && !this.#teaches(viewer, summary.classId))) {
        throw forbidden();
      }
      const row = this.#repository.connection
        .prepare(`SELECT payload FROM report_card_issues WHERE id = ?`)
        .get(issueId) as { payload: string };
      let payload: ReportCardPayloadV1;
      try {
        payload = JSON.parse(row.payload) as ReportCardPayloadV1;
      } catch (error) {
        throw new ReportCardPayloadCorruptError({ cause: error });
      }
      return { summary, payload };
    });
  }

  /** Closed or reopened years that hold cards, newest first; a teacher sees
   * only the classes they were assigned to. */
  listArchivedYears(viewer: ReportCardViewer): ReportCardArchivedYear[] {
    return guardedRead('SqliteReportCardReadModel.listArchivedYears', () => {
      const rows = this.#repository.connection
        .prepare(
          `SELECT DISTINCT ay.id AS academicYearId, ay.code AS code, ay.status AS status, ay.startDate AS startDate,
                  rc.classId AS classId,
                  COALESCE(c.name, (SELECT ${jx('i.payload', '$.class.name')} FROM report_card_issues i
                                    WHERE i.reportCardId = rc.id LIMIT 1)) AS name,
                  COALESCE(c.gradeLevel, rc.gradeLevel) AS gradeLevel
           FROM report_cards rc
           JOIN academic_years ay ON ay.id = rc.academicYearId
           LEFT JOIN classes c ON c.id = rc.classId
           WHERE ay.status IN ('CLOSED', 'REOPENED') AND ${workspaceStudentScope('rc')}
             AND (:teacherUserId IS NULL OR rc.classId IN (SELECT classId FROM (${TEACHER_CLASSES})))
           ORDER BY ay.startDate DESC, ay.id, name, rc.classId`,
        )
        .all({ teacherUserId: viewer.teacherUserId }) as {
        academicYearId: string;
        code: string;
        status: 'CLOSED' | 'REOPENED';
        classId: string;
        name: string;
        gradeLevel: string;
      }[];
      const years: ReportCardArchivedYear[] = [];
      for (const row of rows) {
        let year = years[years.length - 1];
        if (year?.academicYearId !== row.academicYearId) {
          year = { academicYearId: row.academicYearId, code: row.code, status: row.status, classes: [] };
          years.push(year);
        }
        if (!year.classes.some((c) => c.classId === row.classId)) {
          year.classes.push({ classId: row.classId, name: row.name, gradeLevel: row.gradeLevel });
        }
      }
      return years;
    });
  }

  /** Calendar position of each issue's period in the class: term start, then
   * grading-period sequence. A final report (no period) sorts after every period. */
  #periodPositions(classId: string): Map<string, { termStart: string; sequence: number }> {
    const rows = this.#repository.connection
      .prepare(
        `SELECT i.id AS issueId, t.startDate AS termStart, gp.sequence AS sequence
         FROM report_card_issues i
         JOIN report_cards rc ON rc.id = i.reportCardId
         LEFT JOIN grading_periods gp ON gp.id = i.gradingPeriodId
         LEFT JOIN terms t ON t.id = gp.termId
         WHERE rc.classId = ?`,
      )
      .all(classId) as { issueId: string; termStart: string | null; sequence: number | null }[];
    return new Map(
      rows.map((r) => [r.issueId, { termStart: r.termStart ?? '', sequence: r.sequence ?? 0 }]),
    );
  }

  #summaries(where: string, params: Record<string, string>): ReportCardSummary[] {
    return this.#repository.connection
      .prepare(`${SUMMARY_SELECT} WHERE ${where} AND ${workspaceStudentScope('rc')} ${SUMMARY_ORDER}`)
      .all(params) as ReportCardSummary[];
  }

  #teaches(viewer: ReportCardViewer, classId: string): boolean {
    return (
      this.#repository.connection
        .prepare(`SELECT 1 FROM (${TEACHER_CLASSES}) WHERE classId = :classId`)
        .get({ teacherUserId: viewer.teacherUserId, classId }) !== undefined
    );
  }
}

/** `guarded` turns every non-driver error into a DatabaseError; a refusal (or
 * a corrupt payload) is the caller's answer, not a database failure, so
 * application errors pass through intact. */
function guardedRead<T>(context: string, read: () => T): T {
  const result = guarded<T | ApplicationError>(context, () => {
    try {
      return read();
    } catch (error) {
      if (error instanceof ApplicationError) return error;
      throw error;
    }
  });
  if (result instanceof ApplicationError) throw result;
  return result;
}

/** Is `a` a later card than `b`? Term, then grading period, then issue time, then version. */
function isLater(
  a: ReportCardSummary,
  b: ReportCardSummary,
  positions: Map<string, { termStart: string; sequence: number }>,
): boolean {
  const rank = (s: ReportCardSummary) => {
    const p = positions.get(s.issueId);
    return { final: s.kind === 'FINAL' ? 1 : 0, termStart: p?.termStart ?? '', sequence: p?.sequence ?? 0 };
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra.final !== rb.final) return ra.final > rb.final;
  if (ra.termStart !== rb.termStart) return ra.termStart > rb.termStart;
  if (ra.sequence !== rb.sequence) return ra.sequence > rb.sequence;
  if (a.issuedAt !== b.issuedAt) return a.issuedAt > b.issuedAt;
  return a.version > b.version;
}

function forbidden(): ForbiddenError {
  return new ForbiddenError('You do not have access to these report cards.');
}
