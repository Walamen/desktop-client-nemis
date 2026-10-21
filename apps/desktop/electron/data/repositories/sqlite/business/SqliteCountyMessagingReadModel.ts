import type {
  CountyDirectConversation,
  CountyDirectMessage,
  CountyMessageRecipient,
  CountyMessagingOverview,
} from '@nemis-desktop/types';
import type { ICountyMessagingReadModel } from '@nemis-desktop/application';
import type { RepositoryContext } from '../../base/RepositoryContext';
import { guarded } from './support';

/** In this county (alias column `c`), or every row when no county is synced (older server). */
const IN_COUNTY = (column: string) =>
  `(NOT EXISTS (SELECT 1 FROM counties) OR ${column} IN (SELECT id FROM counties))`;

type RecipientRow = {
  userId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  role: string;
  institutionId: string | null;
  institutionName: string | null;
  districtId: string | null;
  districtName: string | null;
};

type ConversationRow = {
  id: string;
  lastMessageAt: string | null;
  createdAt: string;
  counterpartUserId: string;
  counterpartFirstName: string;
  counterpartLastName: string;
  counterpartPhotoUrl: string | null;
  counterpartRole: string;
  counterpartInstitutionName: string | null;
  lastMessage: string | null;
  unreadCount: number;
};

/** SQLite read model for the County Messages page: the server's COUNTY_ADMIN
 * recipient rule (DirectMessagesService.listEligibleRecipients) over synced
 * users, and the user's synced conversations
 * (docs/superpowers/specs/2026-10-21-county-messages-notifications-design.md). */
export class SqliteCountyMessagingReadModel implements ICountyMessagingReadModel {
  readonly #repository: RepositoryContext;

  constructor(repository: RepositoryContext) {
    this.#repository = repository;
  }

  getOverview(currentUserId: string): CountyMessagingOverview {
    return guarded('SqliteCountyMessagingReadModel.getOverview', () => ({
      recipients: this.#recipients(currentUserId),
      conversations: this.#conversations(currentUserId),
    }));
  }

  listMessages(conversationId: string, currentUserId: string): CountyDirectMessage[] | null {
    return guarded('SqliteCountyMessagingReadModel.listMessages', () => {
      const db = this.#repository.connection;
      const conversation = db
        .prepare(
          `SELECT counterpartFirstName, counterpartLastName FROM direct_conversations
           WHERE id = ? AND (initiatorId = ? OR recipientId = ?)`,
        )
        .get(conversationId, currentUserId, currentUserId) as
        | { counterpartFirstName: string; counterpartLastName: string }
        | undefined;
      if (!conversation) return null;
      const counterpartName = `${conversation.counterpartFirstName} ${conversation.counterpartLastName}`;
      const rows = db
        .prepare(
          `SELECT id, conversationId, senderId, content, isRead, readAt, createdAt
           FROM direct_messages WHERE conversationId = ? ORDER BY createdAt, id`,
        )
        .all(conversationId) as (Omit<CountyDirectMessage, 'isRead' | 'isOwn' | 'senderName'> & { isRead: number })[];
      return rows.map((row) => {
        const isOwn = row.senderId === currentUserId;
        return { ...row, isRead: row.isRead === 1, isOwn, senderName: isOwn ? 'You' : counterpartName };
      });
    });
  }

  /** Active DEOs of the county and active School Admins of its schools; one
   * org per user (the lowest id — the desktop has no assignedAt). */
  #recipients(currentUserId: string): CountyMessageRecipient[] {
    const rows = this.#repository.connection
      .prepare(
        `SELECT u.id AS userId, u.firstName, u.lastName, u.photoUrl, o.role, o.institutionId,
                i.name AS institutionName, d.id AS districtId, d.name AS districtName
         FROM users u
         JOIN user_organizations o ON o.userId = u.id AND o.isActive = 1
         LEFT JOIN institutions i ON i.id = o.institutionId
         LEFT JOIN districts d ON d.id = COALESCE(o.districtId, i.districtId)
         WHERE u.isActive = 1 AND u.id <> ?
           AND ((o.role = 'DEO' AND o.countyId IS NOT NULL AND ${IN_COUNTY('o.countyId')})
             OR (o.role = 'INSTITUTION_ADMIN' AND i.id IS NOT NULL AND ${IN_COUNTY('i.countyId')}))
         ORDER BY u.firstName, u.lastName, u.id, o.id`,
      )
      .all(currentUserId) as RecipientRow[];
    const seen = new Set<string>();
    return rows.filter((row) => !seen.has(row.userId) && seen.add(row.userId));
  }

  #conversations(currentUserId: string): CountyDirectConversation[] {
    const rows = this.#repository.connection
      .prepare(
        `SELECT c.id, c.lastMessageAt, c.createdAt, c.counterpartUserId, c.counterpartFirstName,
                c.counterpartLastName, c.counterpartPhotoUrl, c.counterpartRole, c.counterpartInstitutionName,
                (SELECT m.content FROM direct_messages m WHERE m.conversationId = c.id
                  ORDER BY m.createdAt DESC, m.id DESC LIMIT 1) AS lastMessage,
                (SELECT COUNT(*) FROM direct_messages m WHERE m.conversationId = c.id
                  AND m.senderId <> @me AND m.isRead = 0) AS unreadCount
         FROM direct_conversations c
         WHERE c.initiatorId = @me OR c.recipientId = @me
         ORDER BY c.lastMessageAt IS NULL, c.lastMessageAt DESC, c.createdAt DESC, c.id`,
      )
      .all({ me: currentUserId }) as ConversationRow[];
    return rows.map((row) => ({
      id: row.id,
      lastMessageAt: row.lastMessageAt,
      createdAt: row.createdAt,
      counterpart: {
        userId: row.counterpartUserId,
        firstName: row.counterpartFirstName,
        lastName: row.counterpartLastName,
        photoUrl: row.counterpartPhotoUrl,
        role: row.counterpartRole,
        institutionName: row.counterpartInstitutionName,
      },
      lastMessage: row.lastMessage,
      unreadCount: row.unreadCount,
    }));
  }
}
