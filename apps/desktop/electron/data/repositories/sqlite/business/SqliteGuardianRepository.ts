import { Guardian } from '@nemis-desktop/domain';
import type { IGuardianRepository } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface Row {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string | null;
  version: number;
  updatedAt: string;
  lastModifiedBy: string | null;
}
const map = (r: Row) =>
  Guardian.reconstitute({ ...r, email: r.email ?? undefined, lastModifiedBy: r.lastModifiedBy ?? undefined });
export class SqliteGuardianRepository implements IGuardianRepository {
  readonly #s: StatementCache;
  constructor(context: RepositoryContext) {
    this.#s = new StatementCache(context.connection);
  }
  findById(id: string): Guardian | null {
    return guarded('Guardian.findById', () => {
      const r = this.#s
        .get(
          `SELECT id, firstName, lastName, relationship, phoneNumber, email, version, updatedAt, lastModifiedBy FROM ${TableNames.guardians} WHERE id = ?`,
        )
        .get(id) as Row | undefined;
      return r ? map(r) : null;
    });
  }
  exists(id: string): boolean {
    return this.findById(id) !== null;
  }
  save(g: Guardian): void {
    guarded('Guardian.save', () =>
      this.#s
        .get(
          `INSERT INTO ${TableNames.guardians} (id, firstName, lastName, relationship, phoneNumber, email, version, updatedAt, lastModifiedBy, deviceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO UPDATE SET firstName=excluded.firstName,lastName=excluded.lastName,relationship=excluded.relationship,phoneNumber=excluded.phoneNumber,email=excluded.email,version=excluded.version,updatedAt=excluded.updatedAt,lastModifiedBy=excluded.lastModifiedBy`,
        )
        .run(
          g.id,
          g.name.firstName,
          g.name.lastName,
          g.relationship,
          g.phone.value,
          g.email ?? null,
          g.version,
          g.updatedAt,
          g.lastModifiedBy ?? null,
        ),
    );
  }
  findByStudentId(studentId: string): Guardian[] {
    return guarded('Guardian.findByStudentId', () =>
      (
        this.#s
          .get(
            `SELECT g.id, g.firstName, g.lastName, g.relationship, g.phoneNumber, g.email, g.version, g.updatedAt, g.lastModifiedBy FROM ${TableNames.guardians} g JOIN ${TableNames.studentGuardians} sg ON sg.guardianId=g.id WHERE sg.studentId=? ORDER BY sg.isPrimary DESC, g.lastName`,
          )
          .all(studentId) as Row[]
      ).map(map),
    );
  }
}
