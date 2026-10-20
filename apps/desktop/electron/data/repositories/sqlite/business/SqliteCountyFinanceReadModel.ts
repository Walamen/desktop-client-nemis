import type {
  CountyFeeCollectionRecord,
  CountyFeeCollectionsQuery,
  CountyFeeCollectionsResult,
  CountyFeeRuleItem,
  CountyFeeRulesQuery,
  CountyFeeRulesResult,
  CountyFeeRulesSchool,
  CountyFinanceDashboard,
  CountyFinanceDistrictRow,
  CountySchoolFinanceRow,
} from '@nemis-desktop/types';
import type { ICountyFinanceReadModel } from '@nemis-desktop/application';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded, OWN_COUNTY } from './support';

/** The server's DEFAULT_CURRENCY (fees/finance.constants.ts). */
const CURRENCY = 'LRD';
/** The county's active schools (institution alias `i`). */
const ACTIVE_SCHOOLS = `i.isActive = 1 AND ${OWN_COUNTY}`;
/** Obligations (alias `o`) in a current academic year — each school's own. */
const CURRENT_YEAR_OBLIGATIONS = `fee_obligations o
  JOIN academic_years y ON y.id = o.academicYearId AND y.isCurrent = 1
  JOIN institutions i ON i.id = o.institutionId`;
/** finance-summary.service SETTLED_STATUSES, and the statuses that show progress. */
const SETTLED = `('PAID_IN_FULL','WAIVED')`;
const PROGRESS = `('PARTIALLY_PAID','PAID_IN_FULL','WAIVED')`;

/** LIKE term with % _ \ taken literally (paired with ESCAPE '\'). */
const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const rate = (collected: number, expected: number) => (expected > 0 ? Math.round((collected / expected) * 100) : 0);

/** Array of strings, else nothing (the column is JSON text). */
function levelList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((level): level is string => typeof level === 'string') : [];
  } catch {
    return [];
  }
}

type SchoolRow = { id: string; name: string; code: string; districtId: string | null; districtName: string | null };
type RuleRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  amount: number;
  currency: string;
  applicableLevels: string | null;
  isMandatory: number;
  isActive: number;
  institutionId: string;
  institutionName: string;
  ownership: string;
  districtId: string | null;
  districtName: string | null;
};

/** SQLite read model for the County Finance overview and Fee Rules pages, a
 * port of the server's ceo-finance + finance-summary services scoped to each
 * school's current academic year
 * (docs/superpowers/specs/2026-10-20-county-finance-design.md). */
export class SqliteCountyFinanceReadModel implements ICountyFinanceReadModel {
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
  }

  getDashboard(): Omit<CountyFinanceDashboard, 'county'> {
    return guarded('SqliteCountyFinanceReadModel.getDashboard', () => {
      const schools = this.#summaries();
      const sum = (pick: (row: CountySchoolFinanceRow) => number) => schools.reduce((total, row) => total + pick(row), 0);
      const totalExpected = sum((s) => s.totalExpected);
      const totalCollected = sum((s) => s.totalCollected);

      // Schools without a (synced) district are left out, as on the server.
      const districts = new Map<string, CountyFinanceDistrictRow>();
      for (const school of schools) {
        if (!school.districtId || !school.districtName) continue;
        const row = districts.get(school.districtId) ?? {
          districtId: school.districtId,
          districtName: school.districtName,
          totalExpected: 0,
          totalCollected: 0,
          collectionRate: 0,
          schoolCount: 0,
        };
        row.totalExpected += school.totalExpected;
        row.totalCollected += school.totalCollected;
        row.schoolCount += 1;
        districts.set(school.districtId, row);
      }

      return {
        academicYearName: this.#academicYearName(),
        totalExpected,
        totalCollected,
        totalOutstanding: totalExpected - totalCollected,
        collectionRate: rate(totalCollected, totalExpected),
        schoolsReporting: schools.filter((s) => s.totalCollected > 0).length,
        totalSchools: schools.length,
        studentsPaid: sum((s) => s.paidCount),
        studentsPartial: sum((s) => s.partialCount),
        studentsUnpaid: sum((s) => s.unpaidCount),
        currency: CURRENCY,
        districtComparison: [...districts.values()].map((row) => ({
          ...row,
          collectionRate: rate(row.totalCollected, row.totalExpected),
        })),
      };
    });
  }

  listSchools(): CountySchoolFinanceRow[] {
    return guarded('SqliteCountyFinanceReadModel.listSchools', () =>
      this.#summaries().sort((a, b) => a.collectionRate - b.collectionRate),
    );
  }

  listFeeCollections(query: CountyFeeCollectionsQuery): CountyFeeCollectionsResult {
    return guarded('SqliteCountyFinanceReadModel.listFeeCollections', () => {
      const where = [
        'p.isReversed = 0',
        'NOT EXISTS (SELECT 1 FROM fee_payment_reversals rv WHERE rv.paymentId = p.id)',
        ACTIVE_SCHOOLS,
      ];
      const params: unknown[] = [];
      if (query.districtId) {
        where.push('i.districtId = ?');
        params.push(query.districtId);
      }
      if (query.ownership) {
        where.push('i.ownership = ?');
        params.push(query.ownership);
      }
      // Every word must match a name, the NEMIS ID or the school.
      for (const word of (query.search ?? '').trim().split(/\s+/).filter(Boolean)) {
        where.push(`(s.firstName LIKE ? ESCAPE '\\' OR s.lastName LIKE ? ESCAPE '\\'
                     OR s.nemisId LIKE ? ESCAPE '\\' OR i.name LIKE ? ESCAPE '\\')`);
        const term = likeTerm(word);
        params.push(term, term, term, term);
      }
      const from = `FROM fee_payments p
        JOIN fee_obligations o ON o.id = p.obligationId
        JOIN academic_years y ON y.id = o.academicYearId AND y.isCurrent = 1
        JOIN institutions i ON i.id = p.institutionId
        JOIN students s ON s.id = p.studentId
        WHERE ${where.join(' AND ')}`;
      const db = this.#repository.connection;
      const summary = db
        .prepare(
          `SELECT COALESCE(SUM(p.amount), 0) AS totalCollected, COUNT(*) AS totalTransactions,
                  COUNT(DISTINCT p.institutionId) AS schoolsWithPayments ${from}`,
        )
        .get(...params) as CountyFeeCollectionsResult['summary'];
      const records = db
        .prepare(
          `SELECT p.id, s.firstName || ' ' || s.lastName AS studentName, s.nemisId, i.name AS schoolName,
                  i.ownership AS schoolOwnership,
                  (SELECT d.name FROM districts d WHERE d.id = i.districtId) AS districtName,
                  COALESCE((SELECT r.name FROM fee_rules r WHERE r.id = o.feeRuleId), '') AS feeRuleName,
                  p.amount AS amountPaid, p.method, p.reference, p.paidAt
           ${from}
           ORDER BY p.paidAt DESC, p.id
           LIMIT ? OFFSET ?`,
        )
        .all(...params, query.limit, (query.page - 1) * query.limit) as CountyFeeCollectionRecord[];
      return { summary, records, total: summary.totalTransactions, page: query.page, limit: query.limit };
    });
  }

  listFeeRules(query: CountyFeeRulesQuery): CountyFeeRulesResult {
    return guarded('SqliteCountyFinanceReadModel.listFeeRules', () => {
      // Inactive rules too, so the Status column means something; school-less
      // (national seed) rules never belong to a county.
      const where = ['r.institutionId IS NOT NULL', ACTIVE_SCHOOLS];
      const params: unknown[] = [];
      if (query.ownership) {
        where.push('i.ownership = ?');
        params.push(query.ownership);
      }
      if (query.search) {
        where.push(`i.name LIKE ? ESCAPE '\\'`);
        params.push(likeTerm(query.search));
      }
      const rows = this.#repository.connection
        .prepare(
          `SELECT r.id, r.name, r.description, r.category, r.amount, r.currency, r.applicableLevels,
                  r.isMandatory, r.isActive, i.id AS institutionId, i.name AS institutionName, i.ownership,
                  d.id AS districtId, d.name AS districtName
           FROM fee_rules r
           JOIN institutions i ON i.id = r.institutionId
           LEFT JOIN districts d ON d.id = i.districtId
           WHERE ${where.join(' AND ')}
           ORDER BY r.isActive DESC, r.isMandatory DESC, r.createdAt DESC, r.id`,
        )
        .all(...params) as RuleRow[];

      const bySchool = new Map<string, CountyFeeRulesSchool>();
      for (const row of rows) {
        const school = bySchool.get(row.institutionId) ?? {
          id: row.institutionId,
          name: row.institutionName,
          ownership: row.ownership,
          district: row.districtId && row.districtName ? { id: row.districtId, name: row.districtName } : null,
          ownFeeRules: [],
        };
        const item: CountyFeeRuleItem = {
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          amount: row.amount,
          currency: row.currency,
          applicableLevels: levelList(row.applicableLevels),
          isMandatory: row.isMandatory === 1,
          isActive: row.isActive === 1,
        };
        school.ownFeeRules.push(item);
        bySchool.set(row.institutionId, school);
      }
      const schools = [...bySchool.values()].sort((a, b) => a.name.localeCompare(b.name));
      const start = (query.page - 1) * query.limit;
      return { schools: schools.slice(start, start + query.limit), total: schools.length, page: query.page, limit: query.limit };
    });
  }

  /** finance-summary summarizeInstitutions, current year only, one row per active school. */
  #summaries(): CountySchoolFinanceRow[] {
    const db = this.#repository.connection;
    const schools = db
      .prepare(
        `SELECT i.id, i.name, i.code, i.districtId, d.name AS districtName
         FROM institutions i LEFT JOIN districts d ON d.id = i.districtId
         WHERE ${ACTIVE_SCHOOLS}`,
      )
      .all() as SchoolRow[];
    const sums = new Map(
      (
        db
          .prepare(
            `SELECT o.institutionId, SUM(o.requiredAmount) AS expected, SUM(o.totalPaid) AS collected
             FROM ${CURRENT_YEAR_OBLIGATIONS} WHERE ${ACTIVE_SCHOOLS} GROUP BY o.institutionId`,
          )
          .all() as { institutionId: string; expected: number; collected: number }[]
      ).map((row) => [row.institutionId, row]),
    );
    // Per (school, student): paid when every status is settled; partial when
    // not, but any shows progress.
    const classes = new Map(
      (
        db
          .prepare(
            `SELECT institutionId, SUM(allSettled) AS paid,
                    SUM(CASE WHEN allSettled = 0 AND anyProgress = 1 THEN 1 ELSE 0 END) AS partial
             FROM (SELECT o.institutionId, o.studentId,
                          MIN(o.status IN ${SETTLED}) AS allSettled, MAX(o.status IN ${PROGRESS}) AS anyProgress
                   FROM ${CURRENT_YEAR_OBLIGATIONS} WHERE ${ACTIVE_SCHOOLS}
                   GROUP BY o.institutionId, o.studentId)
             GROUP BY institutionId`,
          )
          .all() as { institutionId: string; paid: number; partial: number }[]
      ).map((row) => [row.institutionId, row]),
    );
    const students = new Map(
      (
        db
          .prepare(
            `SELECT s.institutionId, COUNT(*) AS count FROM students s JOIN institutions i ON i.id = s.institutionId
             WHERE s.isActive = 1 AND ${ACTIVE_SCHOOLS} GROUP BY s.institutionId`,
          )
          .all() as { institutionId: string; count: number }[]
      ).map((row) => [row.institutionId, row.count]),
    );

    return schools.map((school) => {
      const expected = sums.get(school.id)?.expected ?? 0;
      const collected = sums.get(school.id)?.collected ?? 0;
      const studentCount = students.get(school.id) ?? 0;
      const paidCount = classes.get(school.id)?.paid ?? 0;
      const partialCount = classes.get(school.id)?.partial ?? 0;
      return {
        institutionId: school.id,
        institutionName: school.name,
        institutionCode: school.code,
        districtId: school.districtId,
        districtName: school.districtName,
        totalExpected: expected,
        totalCollected: collected,
        totalOutstanding: expected - collected,
        collectionRate: rate(collected, expected),
        studentCount,
        paidCount,
        partialCount,
        unpaidCount: Math.max(0, studentCount - paidCount - partialCount),
        currency: CURRENCY,
      };
    });
  }

  /** One name when every own-county active school's current year shares it; else null. */
  #academicYearName(): string | null {
    const names = this.#repository.connection
      .prepare(
        `SELECT DISTINCT y.code AS name FROM academic_years y JOIN institutions i ON i.id = y.institutionId
         WHERE y.isCurrent = 1 AND ${ACTIVE_SCHOOLS}`,
      )
      .all() as { name: string }[];
    return names.length === 1 ? names[0]!.name : null;
  }
}
