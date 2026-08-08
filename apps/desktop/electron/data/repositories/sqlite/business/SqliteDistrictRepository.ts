import type { DistrictRef, IDistrictRepository } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import { StatementCache } from '../../base/StatementCache';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

/** Read-only SQLite adapter for IDistrictRepository. */
export class SqliteDistrictRepository implements IDistrictRepository {
  readonly #statements: StatementCache;

  constructor(context: RepositoryContext) {
    this.#statements = new StatementCache(context.connection);
  }

  findAll(): DistrictRef[] {
    return guarded('SqliteDistrictRepository.findAll', () => {
      return this.#statements
        .get(`SELECT id, name, countyId FROM ${TableNames.districts} ORDER BY name ASC`)
        .all() as DistrictRef[];
    });
  }
}
