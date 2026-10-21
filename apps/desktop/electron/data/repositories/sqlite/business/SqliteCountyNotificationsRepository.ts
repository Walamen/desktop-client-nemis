import type { CountyNotification, CountyNotificationsPage, CountyNotificationsQuery } from '@nemis-desktop/types';
import type { ICountyNotificationsRepository } from '@nemis-desktop/application';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const IN_COUNTY = (column: string) =>
  `(NOT EXISTS (SELECT 1 FROM counties) OR ${column} IN (SELECT id FROM counties))`;

/** An alert about this county: tagged with it, or with one of its districts or schools. */
const COUNTY_ALERT = `(${IN_COUNTY('a.countyId')} AND a.countyId IS NOT NULL
  OR a.districtId IN (SELECT d.id FROM districts d WHERE ${IN_COUNTY('d.countyId')})
  OR a.institutionId IN (SELECT i.id FROM institutions i WHERE ${IN_COUNTY('i.countyId')}))`;

const FILTER_SQL: Record<CountyNotificationsQuery['filter'], string> = {
  ALL: '',
  UNREAD: 'AND isRead = 0',
  READ: 'AND isRead = 1',
};

/** The County Notifications page over synced user_notifications. Marking
 * read is a plain UPDATE: the table's outbox triggers queue it for push. */
export class SqliteCountyNotificationsRepository implements ICountyNotificationsRepository {
  readonly #repository: RepositoryContext;
  readonly #now: () => string;

  constructor(repository: RepositoryContext, now: () => string = () => new Date().toISOString()) {
    this.#repository = repository;
    this.#now = now;
  }

  list(recipientId: string, query: CountyNotificationsQuery): CountyNotificationsPage {
    return guarded('SqliteCountyNotificationsRepository.list', () => {
      const db = this.#repository.connection;
      const filter = FILTER_SQL[query.filter];
      const rows = db
        .prepare(
          `SELECT id, type, title, message, isRead, link, createdAt FROM user_notifications
           WHERE recipientId = ? ${filter}
           ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(recipientId, query.limit, (query.page - 1) * query.limit) as (Omit<CountyNotification, 'isRead'> & {
        isRead: number;
      })[];
      const count = (where: string) =>
        (db.prepare(`SELECT COUNT(*) AS n FROM user_notifications WHERE recipientId = ? ${where}`).get(recipientId) as {
          n: number;
        }).n;
      const alertsUnresolved = (
        db.prepare(`SELECT COUNT(*) AS n FROM alerts a WHERE a.isResolved = 0 AND ${COUNTY_ALERT}`).get() as { n: number }
      ).n;
      return {
        items: rows.map((row) => ({ ...row, isRead: row.isRead === 1 })),
        total: count(filter),
        totalAll: count(''),
        unread: count(FILTER_SQL.UNREAD),
        alertsUnresolved,
        page: query.page,
        limit: query.limit,
      };
    });
  }

  markRead(recipientId: string, notificationId: string): boolean {
    return guarded('SqliteCountyNotificationsRepository.markRead', () =>
      this.#repository.connection
        .prepare(`UPDATE user_notifications SET isRead = 1, updatedAt = ? WHERE id = ? AND recipientId = ? AND isRead = 0`)
        .run(this.#now(), notificationId, recipientId).changes > 0,
    );
  }

  markAllRead(recipientId: string): number {
    return guarded('SqliteCountyNotificationsRepository.markAllRead', () =>
      this.#repository.connection
        .prepare(`UPDATE user_notifications SET isRead = 1, updatedAt = ? WHERE recipientId = ? AND isRead = 0`)
        .run(this.#now(), recipientId).changes,
    );
  }
}
