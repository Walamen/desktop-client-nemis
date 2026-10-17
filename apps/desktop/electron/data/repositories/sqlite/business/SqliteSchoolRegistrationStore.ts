import type {
  SchoolRegistration,
  SchoolRegistrationContext,
  SchoolRegistrationPayload,
  SchoolRegistrationSource,
  SchoolRegistrationSyncState,
} from '@nemis-desktop/types';
import type { ISchoolRegistrationStore, NewSchoolRegistration } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { schoolRegistrations, institutions, counties, districts } = TableNames;

/** Rows registered under the synced county only. */
const OWN_COUNTY = `countyId IN (SELECT id FROM ${counties})`;

type Row = {
  id: string;
  countyId: string;
  source: SchoolRegistrationSource;
  payload: string;
  syncState: SchoolRegistrationSyncState;
  syncError: string | null;
  principalEmail: string | null;
  principalPassword: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
};

const COLUMNS = `id, countyId, source, payload, syncState, syncError, principalEmail, principalPassword,
  createdAt, updatedAt, syncedAt`;

/** A corrupt payload must not blank the page or be sent: the row reads as missing. */
function toRegistration(row: Row): SchoolRegistration | null {
  let payload: SchoolRegistrationPayload;
  try {
    const parsed: unknown = JSON.parse(row.payload);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    payload = parsed as SchoolRegistrationPayload;
  } catch {
    return null;
  }
  return {
    id: row.id,
    countyId: row.countyId,
    source: row.source,
    payload,
    syncState: row.syncState,
    syncError: row.syncError,
    principalLogin:
      row.principalEmail && row.principalPassword
        ? { email: row.principalEmail, password: row.principalPassword }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    syncedAt: row.syncedAt,
  };
}

/** SQLite adapter for ISchoolRegistrationStore (school_registrations, migration 034). */
export class SqliteSchoolRegistrationStore implements ISchoolRegistrationStore {
  readonly #statements: StatementCache;
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
    this.#statements = new StatementCache(repository.connection);
  }

  context(): SchoolRegistrationContext {
    return guarded('SqliteSchoolRegistrationStore.context', () => {
      const county = this.#statements
        .get(`SELECT id, name, code FROM ${counties} ORDER BY id LIMIT 1`)
        .get() as SchoolRegistrationContext['county'] | undefined;
      if (!county) return { county: null, districts: [] };
      const rows = this.#statements
        .get(`SELECT id, name FROM ${districts} WHERE countyId = ? AND isActive = 1 ORDER BY name ASC`)
        .all(county.id) as SchoolRegistrationContext['districts'];
      return { county, districts: rows };
    });
  }

  existingCodes(codes: readonly string[]): Array<{ code: string; name: string }> {
    return guarded('SqliteSchoolRegistrationStore.existingCodes', () => {
      const institution = this.#statements.get(`SELECT name FROM ${institutions} WHERE code = ? LIMIT 1`);
      const waiting = this.#statements.get(
        `SELECT json_extract(payload, '$.name') AS name FROM ${schoolRegistrations}
         WHERE json_valid(payload) AND json_extract(payload, '$.code') = ? AND syncState != 'rejected' LIMIT 1`,
      );
      return codes.flatMap((code) => {
        const found = (institution.get(code) ?? waiting.get(code)) as { name: string | null } | undefined;
        return found ? [{ code, name: found.name ?? '' }] : [];
      });
    });
  }

  knownInstitutionIds(ids: readonly string[]): string[] {
    return guarded('SqliteSchoolRegistrationStore.knownInstitutionIds', () => {
      const exists = this.#statements.get(`SELECT 1 FROM ${institutions} WHERE id = ? LIMIT 1`);
      return ids.filter((id) => exists.get(id) !== undefined);
    });
  }

  insertMany(rows: readonly NewSchoolRegistration[]): void {
    guarded('SqliteSchoolRegistrationStore.insertMany', () => {
      const insert = this.#statements.get(
        `INSERT INTO ${schoolRegistrations} (id, countyId, createdBy, source, payload, syncState, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      );
      this.#repository.transactions.runImmediate(() => {
        for (const row of rows) {
          insert.run(row.id, row.countyId, row.createdBy, row.source, JSON.stringify(row.payload), row.now, row.now);
        }
      });
    });
  }

  getForUser(id: string, userId: string): SchoolRegistration | null {
    return guarded('SqliteSchoolRegistrationStore.getForUser', () => {
      const row = this.#statements
        .get(`SELECT ${COLUMNS} FROM ${schoolRegistrations} WHERE id = ? AND createdBy = ? AND ${OWN_COUNTY}`)
        .get(id, userId) as Row | undefined;
      return row ? toRegistration(row) : null;
    });
  }

  listForUser(userId: string, ids?: readonly string[]): SchoolRegistration[] {
    return guarded('SqliteSchoolRegistrationStore.listForUser', () => {
      const rows = this.#statements
        .get(
          `SELECT ${COLUMNS} FROM ${schoolRegistrations} WHERE createdBy = ? AND ${OWN_COUNTY}
           ORDER BY createdAt ASC, id ASC`,
        )
        .all(userId) as Row[];
      const wanted = ids ? new Set(ids) : null;
      return rows.flatMap((row) => {
        if (wanted && !wanted.has(row.id)) return [];
        const registration = toRegistration(row);
        return registration ? [registration] : [];
      });
    });
  }

  resubmit(id: string, userId: string, payload: SchoolRegistrationPayload, now: string): boolean {
    return guarded('SqliteSchoolRegistrationStore.resubmit', () =>
      this.#statements
        .get(
          `UPDATE ${schoolRegistrations} SET payload = ?, syncState = 'pending', syncError = NULL, updatedAt = ?
           WHERE id = ? AND createdBy = ? AND syncState = 'rejected' AND ${OWN_COUNTY}`,
        )
        .run(JSON.stringify(payload), now, id, userId).changes === 1,
    );
  }

  discard(id: string, userId: string): boolean {
    return guarded('SqliteSchoolRegistrationStore.discard', () =>
      this.#statements
        .get(
          `DELETE FROM ${schoolRegistrations}
           WHERE id = ? AND createdBy = ? AND syncState = 'rejected' AND ${OWN_COUNTY}`,
        )
        .run(id, userId).changes === 1,
    );
  }
}
