import type { CountySettings } from '@nemis-desktop/types';
import type { ICountySettingsReadModel } from '@nemis-desktop/application';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

interface CountyRow {
  id: string;
  name: string;
  code: string | null;
  isActive: number;
  createdAt: string | null;
  updatedAt: string | null;
}

/** County Settings' County Information card: the synced county row, and its
 * districts and schools (all, as the web's counts are). */
export class SqliteCountySettingsReadModel implements ICountySettingsReadModel {
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
  }

  get(): CountySettings {
    return guarded('SqliteCountySettingsReadModel.get', () => {
      const db = this.#repository.connection;
      const row = db
        .prepare(`SELECT id, name, code, isActive, createdAt, updatedAt FROM counties ORDER BY id LIMIT 1`)
        .get() as CountyRow | undefined;
      if (!row) return { county: null, districtCount: 0, schoolCount: 0 };
      const count = (table: 'districts' | 'institutions') =>
        (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE countyId = ?`).get(row.id) as { n: number }).n;
      return {
        county: {
          id: row.id,
          name: row.name,
          code: row.code,
          isActive: row.isActive === 1,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        districtCount: count('districts'),
        schoolCount: count('institutions'),
      };
    });
  }
}
