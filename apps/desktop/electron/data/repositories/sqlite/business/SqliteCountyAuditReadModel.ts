import type {
  CountyAuditLog,
  CountyAuditOption,
  CountyAuditPage,
  CountyAuditQuery,
  CountyAuditStats,
} from '@nemis-desktop/types';
import type { ICountyAuditReadModel } from '@nemis-desktop/application';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { actionLabel, entityLabel } from './audit-labels';
import { guarded } from './support';

const DAY_MS = 24 * 60 * 60 * 1000;

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  timestamp: string;
  actorName: string;
  actorScope: string;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const byLabel = (a: CountyAuditOption, b: CountyAuditOption) => a.label.localeCompare(b.label);

/** The County Audit Trail over synced audit_logs (the server already scoped
 * them to the county's actors). Everything is limited to the last 365 days,
 * the window the importer keeps. */
export class SqliteCountyAuditReadModel implements ICountyAuditReadModel {
  readonly #repository: RepositoryContext;
  readonly #now: () => Date;

  constructor(repository: RepositoryContext, now: () => Date = () => new Date()) {
    this.#repository = repository;
    this.#now = now;
  }

  #windowStart(): string {
    return new Date(this.#now().getTime() - 365 * DAY_MS).toISOString();
  }

  #distinct(column: 'action' | 'entityType'): string[] {
    return (
      this.#repository.connection
        .prepare(`SELECT DISTINCT ${column} AS value FROM audit_logs WHERE timestamp >= ?`)
        .all(this.#windowStart()) as { value: string }[]
    ).map((r) => r.value);
  }

  getStats(): CountyAuditStats {
    return guarded('SqliteCountyAuditReadModel.getStats', () => {
      const db = this.#repository.connection;
      const midnight = new Date(this.#now());
      midnight.setHours(0, 0, 0, 0);
      const weekStart = new Date(midnight);
      weekStart.setDate(weekStart.getDate() - 7);
      const count = (since: string) =>
        (db.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE timestamp >= ?`).get(since) as { n: number }).n;
      return {
        total: count(this.#windowStart()),
        today: count(midnight.toISOString()),
        week: count(weekStart.toISOString()),
        actions: this.#distinct('action').map((value) => ({ value, label: actionLabel(value) })).sort(byLabel),
        entityTypes: this.#distinct('entityType').map((value) => ({ value, label: entityLabel(value) })).sort(byLabel),
      };
    });
  }

  list(query: CountyAuditQuery): CountyAuditPage {
    return guarded('SqliteCountyAuditReadModel.list', () => {
      const db = this.#repository.connection;
      const where: string[] = ['timestamp >= ?'];
      const params: unknown[] = [this.#windowStart()];
      if (query.action) {
        where.push('action = ?');
        params.push(query.action);
      }
      if (query.entityType) {
        where.push('entityType = ?');
        params.push(query.entityType);
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        const actions = this.#distinct('action').filter((a) => actionLabel(a).toLowerCase().includes(q));
        const entities = this.#distinct('entityType').filter((t) => entityLabel(t).toLowerCase().includes(q));
        const or = [`actorName LIKE ? ESCAPE '\\'`];
        params.push(`%${escapeLike(query.search)}%`);
        if (actions.length) {
          or.push(`action IN (${actions.map(() => '?').join(',')})`);
          params.push(...actions);
        }
        if (entities.length) {
          or.push(`entityType IN (${entities.map(() => '?').join(',')})`);
          params.push(...entities);
        }
        where.push(`(${or.join(' OR ')})`);
      }
      const whereSql = where.join(' AND ');
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE ${whereSql}`).get(...params) as { n: number }).n;
      const rows = db
        .prepare(
          `SELECT id, action, entityType, timestamp, actorName, actorScope FROM audit_logs
           WHERE ${whereSql} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, query.limit, (query.page - 1) * query.limit) as AuditRow[];
      const items: CountyAuditLog[] = rows.map((r) => ({
        id: r.id,
        action: r.action,
        actionLabel: actionLabel(r.action),
        entityType: r.entityType,
        entityLabel: entityLabel(r.entityType),
        actorName: r.actorName,
        scope: r.actorScope,
        timestamp: r.timestamp,
      }));
      return { items, total, page: query.page, limit: query.limit };
    });
  }
}
