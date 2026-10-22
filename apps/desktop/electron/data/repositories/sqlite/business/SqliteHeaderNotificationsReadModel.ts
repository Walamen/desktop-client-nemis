import type { HeaderNotification, HeaderNotificationsSummary } from '@nemis-desktop/types';
import type { IHeaderNotificationsReadModel } from '@nemis-desktop/application';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

const UNREAD_NON_MESSAGE = `recipientId = ? AND isRead = 0 AND type <> 'NEW_MESSAGE'`;

/** The Header bell: unread count and newest notifications, message
 * notifications excluded (the Messages badge covers those). */
export class SqliteHeaderNotificationsReadModel implements IHeaderNotificationsReadModel {
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
  }

  summary(recipientId: string, limit: number): HeaderNotificationsSummary {
    return guarded('SqliteHeaderNotificationsReadModel.summary', () => {
      const db = this.#repository.connection;
      const unread = (
        db.prepare(`SELECT COUNT(*) AS n FROM user_notifications WHERE ${UNREAD_NON_MESSAGE}`).get(recipientId) as {
          n: number;
        }
      ).n;
      const recent = db
        .prepare(
          `SELECT id, type, title, message, link, createdAt FROM user_notifications
           WHERE ${UNREAD_NON_MESSAGE} ORDER BY createdAt DESC, id DESC LIMIT ?`,
        )
        .all(recipientId, limit) as HeaderNotification[];
      return { unread, recent };
    });
  }
}
