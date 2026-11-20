import type { AlertOfficer, IDistrictAlertStore } from '@nemis-desktop/application';
import { TableNames } from '../../../../database/schema/tableNames';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded, notSchoolStaffRequest } from './support';

const { alerts, districts, institutions } = TableNames;

const INFRASTRUCTURE = 'INFRASTRUCTURE_ISSUE';

type InfrastructureStatus = 'OPEN' | 'UNDER_REVIEW' | 'ESCALATED';

interface AlertRow {
  type: string;
  severity: string;
  countyId: string | null;
  metadata: string | null;
}

/** Mirrors the server's infrastructureStatus: OPEN, UNDER_REVIEW and
 * ESCALATED are kept, anything else (RESOLVED included) reads as OPEN. */
function statusOf(metadata: Record<string, unknown>): InfrastructureStatus {
  const status = metadata.status;
  return status === 'UNDER_REVIEW' || status === 'ESCALATED' ? status : 'OPEN';
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The DEO's local alert writes. Plain UPDATEs: the alerts table's outbox
 * triggers queue each for push, and the server accepts alert changes from a
 * DEO (desktop-sync-applier), replacing the whole metadata. So every write
 * here merges into the existing metadata first. */
export class SqliteDistrictAlertStore implements IDistrictAlertStore {
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
  }

  resolve(districtId: string, alertId: string, by: AlertOfficer, at: string): boolean {
    return guarded('SqliteDistrictAlertStore.resolve', () =>
      this.#act(districtId, alertId, false, (row) => {
        // Only infrastructure issues carry status metadata; any status,
        // an escalated one included, is closed by this shared resolve.
        const metadata =
          row.type === INFRASTRUCTURE
            ? { ...parseMetadata(row.metadata), status: 'RESOLVED', resolvedAt: at, resolvedById: by.id, resolvedByName: by.name }
            : null;
        return { resolved: true, metadata };
      }, by, at),
    );
  }

  review(districtId: string, alertId: string, by: AlertOfficer, comments: string | null, at: string): boolean {
    return guarded('SqliteDistrictAlertStore.review', () =>
      this.#act(districtId, alertId, true, (row) => {
        const metadata = parseMetadata(row.metadata);
        if (statusOf(metadata) !== 'OPEN') return null;
        return {
          resolved: false,
          metadata: {
            ...metadata,
            status: 'UNDER_REVIEW',
            reviewedAt: at,
            reviewedById: by.id,
            reviewedByName: by.name,
            reviewComments: comments,
          },
        };
      }, by, at),
    );
  }

  resolveInfrastructure(districtId: string, alertId: string, by: AlertOfficer, comments: string | null, at: string): boolean {
    return guarded('SqliteDistrictAlertStore.resolveInfrastructure', () =>
      this.#act(districtId, alertId, true, (row) => {
        const metadata = parseMetadata(row.metadata);
        if (statusOf(metadata) === 'ESCALATED') return null;
        return {
          resolved: true,
          metadata: {
            ...metadata,
            status: 'RESOLVED',
            resolvedAt: at,
            resolvedById: by.id,
            resolvedByName: by.name,
            resolutionComments: comments,
          },
        };
      }, by, at),
    );
  }

  escalate(districtId: string, alertId: string, by: AlertOfficer, reason: string, at: string): boolean {
    return guarded('SqliteDistrictAlertStore.escalate', () => {
      if (reason.trim() === '') return false;
      return this.#act(districtId, alertId, true, (row) => {
        const metadata = parseMetadata(row.metadata);
        if (statusOf(metadata) === 'ESCALATED') return null;
        if (row.severity !== 'HIGH' && row.severity !== 'CRITICAL') return null;
        return {
          resolved: false,
          countyFromDistrict: row.countyId === null,
          metadata: {
            ...metadata,
            status: 'ESCALATED',
            escalatedAt: at,
            escalatedById: by.id,
            escalatedByName: by.name,
            escalationReason: reason,
            escalatedToCounty: true,
          },
        };
      }, by, at);
    });
  }

  /** Reads the alert under the authorisation WHERE, asks `decide` for the
   * write (null refuses), and applies it, all in one transaction. */
  #act(
    districtId: string,
    alertId: string,
    infrastructureOnly: boolean,
    decide: (row: AlertRow) => { resolved: boolean; metadata: Record<string, unknown> | null; countyFromDistrict?: boolean } | null,
    by: AlertOfficer,
    at: string,
  ): boolean {
    const db = this.#repository.connection;
    const run = db.transaction((): boolean => {
      // The WHERE clause is the authorisation: only an unresolved alert of
      // this district, or of one of its active schools, matches. A
      // county-level alert that happens to be on the device does not, and
      // neither does a teacher's request to their school admin.
      const row = db
        .prepare(
          `SELECT type, severity, countyId, metadata FROM ${alerts}
           WHERE id = ? AND isResolved = 0
             ${infrastructureOnly ? `AND type = '${INFRASTRUCTURE}'` : ''}
             AND ${notSchoolStaffRequest('metadata')}
             AND (districtId = ?
                  OR institutionId IN (SELECT i.id FROM ${institutions} i WHERE i.districtId = ? AND i.isActive = 1))`,
        )
        .get(alertId, districtId, districtId) as AlertRow | undefined;
      if (!row) return false;
      const write = decide(row);
      if (!write) return false;

      const sets: string[] = ['updatedAt = ?'];
      const params: unknown[] = [at];
      if (write.metadata) {
        sets.push('metadata = ?');
        params.push(JSON.stringify(write.metadata));
      }
      if (write.resolved) {
        sets.push('isResolved = 1', 'resolvedAt = ?', 'resolvedBy = ?');
        params.push(at, by.id);
      }
      if (write.countyFromDistrict) {
        const county = db.prepare(`SELECT countyId FROM ${districts} WHERE id = ?`).get(districtId) as
          | { countyId: string | null }
          | undefined;
        if (county?.countyId) {
          sets.push('countyId = ?');
          params.push(county.countyId);
        }
      }
      return db.prepare(`UPDATE ${alerts} SET ${sets.join(', ')} WHERE id = ?`).run(...params, alertId).changes > 0;
    });
    return run();
  }
}
