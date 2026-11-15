import type { IDistrictAlertStore } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const { alerts, institutions } = TableNames;

/** "Mark Reviewed" on the DEO dashboard. A plain UPDATE: the alerts table's
 * outbox triggers queue it for push, and the server accepts alert changes
 * from a DEO (desktop-sync-applier). */
export class SqliteDistrictAlertStore implements IDistrictAlertStore {
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
  }

  resolve(districtId: string, alertId: string, resolvedBy: string, at: string): boolean {
    return guarded('SqliteDistrictAlertStore.resolve', () => {
      // The WHERE clause is the authorisation: only an unresolved alert of
      // this district, or of one of its schools, matches. A county-level
      // alert that happens to be on the device does not.
      return (
        this.#repository.connection
          .prepare(
            `UPDATE ${alerts}
             SET isResolved = 1, resolvedAt = ?, resolvedBy = ?, updatedAt = ?
             WHERE id = ? AND isResolved = 0
               AND (districtId = ?
                    OR institutionId IN (SELECT i.id FROM ${institutions} i WHERE i.districtId = ?))`,
          )
          .run(at, resolvedBy, at, alertId, districtId, districtId).changes > 0
      );
    });
  }
}
