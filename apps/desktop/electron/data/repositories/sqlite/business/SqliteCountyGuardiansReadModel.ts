import type {
  CountyGuardianChild,
  CountyGuardianDetail,
  CountyGuardianListItem,
  CountyGuardiansQuery,
  CountyGuardiansResult,
  CountyGuardianStats,
} from '@nemis-desktop/types';
import type { ICountyGuardiansReadModel } from '@nemis-desktop/application';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded, OWN_COUNTY } from './support';

/** A guardian's links with their student and school (aliases sg, s, i). */
const LINKS = `student_guardians sg JOIN students s ON s.id = sg.studentId JOIN institutions i ON i.id = s.institutionId`;
/** guardians.service findByCounty / getStatsByCounty: an active child at an active own-county school. */
const ACTIVE_LINK = `s.isActive = 1 AND i.isActive = 1 AND ${OWN_COUNTY}`;
/** The base set: guardians the county list shows. */
const IN_LIST = `EXISTS (SELECT 1 FROM ${LINKS} WHERE sg.guardianId = g.id AND ${ACTIVE_LINK})`;
/** Each guardian's count of links to own-county students, whatever their or their school's state. */
const COUNTY_LINK_COUNT = `(SELECT COUNT(*) FROM ${LINKS} WHERE sg.guardianId = g.id AND ${OWN_COUNTY})`;

/** LIKE term with % _ \ taken literally (paired with ESCAPE '\'). */
const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

type GuardianRow = {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string | null;
  address: string | null;
  occupation: string | null;
  isEmergencyContact: number;
  photoUrl: string | null;
};

type ChildRow = {
  id: string;
  firstName: string;
  lastName: string;
  nemisId: string | null;
  photoUrl: string | null;
  isActive: number;
  isPrimary: number;
  institutionId: string;
  institutionName: string;
  institutionActive: number;
  districtName: string | null;
};

/** SQLite read model for the County Parents & Guardians list and profile
 * (docs/superpowers/specs/2026-10-18-county-parents-design.md §5.2–5.6). */
export class SqliteCountyGuardiansReadModel implements ICountyGuardiansReadModel {
  readonly #statements: StatementCache;
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
    this.#statements = new StatementCache(repository.connection);
  }

  listGuardians(query: CountyGuardiansQuery): Omit<CountyGuardiansResult, 'county' | 'districts'> {
    return guarded('SqliteCountyGuardiansReadModel.listGuardians', () => {
      const where: string[] = [IN_LIST];
      const params: unknown[] = [];
      const search = query.search?.trim();
      if (search) {
        where.push(
          `(g.firstName LIKE ? ESCAPE '\\' OR g.lastName LIKE ? ESCAPE '\\'
            OR g.phoneNumber LIKE ? ESCAPE '\\' OR g.email LIKE ? ESCAPE '\\')`,
        );
        const term = likeTerm(search);
        params.push(term, term, term, term);
      }
      if (query.relationship) {
        where.push('lower(trim(g.relationship)) = lower(?)');
        params.push(query.relationship.trim());
      }
      if (query.districtId) {
        where.push(`EXISTS (SELECT 1 FROM ${LINKS} WHERE sg.guardianId = g.id AND ${OWN_COUNTY} AND i.districtId = ?)`);
        params.push(query.districtId);
      }
      const from = `FROM guardians g WHERE ${where.join(' AND ')}`;
      const db = this.#repository.connection;
      const { total } = db.prepare(`SELECT COUNT(*) AS total ${from}`).get(...params) as { total: number };
      const page = Math.max(query.page, 1);
      const rows = db
        .prepare(
          `SELECT g.id, g.firstName, g.lastName, g.relationship, g.phoneNumber, g.email, g.photoUrl,
                  ${COUNTY_LINK_COUNT} AS studentsCount
           ${from} ORDER BY g.lastName ASC, g.firstName ASC, g.id ASC LIMIT ? OFFSET ?`,
        )
        .all(...params, query.limit, (page - 1) * query.limit) as Array<Omit<CountyGuardianListItem, 'districts'>>;

      return {
        stats: this.#stats(),
        data: rows.map((row) => ({ ...row, districts: this.#districts(row.id) })),
        total,
        page,
        limit: query.limit,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      };
    });
  }

  getGuardian(id: string): CountyGuardianDetail | null {
    return guarded('SqliteCountyGuardiansReadModel.getGuardian', () => {
      const guardian = this.#statements
        .get(
          `SELECT id, firstName, lastName, relationship, phoneNumber, email, address, occupation,
                  isEmergencyContact, photoUrl
           FROM guardians WHERE id = ?`,
        )
        .get(id) as GuardianRow | undefined;
      if (!guardian) return null;
      const rows = this.#statements
        .get(
          `SELECT s.id, s.firstName, s.lastName, s.nemisId, s.photoUrl, s.isActive, sg.isPrimary,
                  i.id AS institutionId, i.name AS institutionName, i.isActive AS institutionActive,
                  (SELECT d.name FROM districts d WHERE d.id = i.districtId) AS districtName
           FROM ${LINKS} WHERE sg.guardianId = ? AND ${OWN_COUNTY}
           ORDER BY s.lastName ASC, s.firstName ASC, s.id ASC`,
        )
        .all(id) as ChildRow[];
      // Only a guardian of this county's children is on this page.
      if (rows.length === 0) return null;

      // Send Message: the admins a County Admin can reach are those of active
      // own-county schools, so only active children there count (§5.5).
      const reachable = rows.filter((row) => row.isActive === 1 && row.institutionActive === 1);
      const messageChild = reachable.find((row) => row.isPrimary === 1) ?? reachable[0];
      const children: CountyGuardianChild[] = rows.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        nemisId: row.nemisId,
        photoUrl: row.photoUrl,
        isActive: row.isActive === 1,
        isPrimary: row.isPrimary === 1,
        institution: { id: row.institutionId, name: row.institutionName, districtName: row.districtName },
      }));
      return {
        ...guardian,
        isEmergencyContact: guardian.isEmergencyContact === 1,
        studentsCount: rows.length,
        districts: [...new Set(rows.map((row) => row.districtName).filter((name): name is string => name !== null))].sort(),
        messageInstitutionId: messageChild?.institutionId ?? null,
        children,
      };
    });
  }

  /** Distinct district names of a guardian's own-county children's schools. */
  #districts(guardianId: string): string[] {
    return (
      this.#statements
        .get(
          `SELECT DISTINCT d.name FROM ${LINKS} JOIN districts d ON d.id = i.districtId
           WHERE sg.guardianId = ? AND ${OWN_COUNTY} ORDER BY d.name ASC`,
        )
        .all(guardianId) as Array<{ name: string }>
    ).map((row) => row.name);
  }

  /** guardians.service getStatsByCounty over the base set; Children Covered = the web's sum of studentsCount. */
  #stats(): CountyGuardianStats {
    return this.#statements
      .get(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(EXISTS (SELECT 1 FROM ${LINKS} WHERE sg.guardianId = g.id AND sg.isPrimary = 1 AND ${ACTIVE_LINK})), 0)
                  AS primaryGuardians,
                COALESCE(SUM(${COUNTY_LINK_COUNT}), 0) AS childrenCovered
         FROM guardians g WHERE ${IN_LIST}`,
      )
      .get() as CountyGuardianStats;
  }
}
