import type {
  CountyDirectMessage,
  CountyMessagingOverview,
  CountyNotificationsPage,
  CountyNotificationsQuery,
} from '@nemis-desktop/types';

/** County Messages page, read from this device's synced conversations and
 * users (docs/superpowers/specs/2026-10-21-county-messages-notifications-design.md). */
export interface ICountyMessagingReadModel {
  /** Eligible recipients (server COUNTY_ADMIN rule) and the user's conversations. */
  getOverview(currentUserId: string): CountyMessagingOverview;
  /** A conversation's messages, oldest first; null when the user is not in it. */
  listMessages(conversationId: string, currentUserId: string): CountyDirectMessage[] | null;
}

/** County Notifications page: the user's synced notifications. Marking read
 * writes the local rows; the outbox pushes them. */
export interface ICountyNotificationsRepository {
  list(recipientId: string, query: CountyNotificationsQuery): CountyNotificationsPage;
  /** False when the notification is not the recipient's (or already read). */
  markRead(recipientId: string, notificationId: string): boolean;
  /** How many were marked. */
  markAllRead(recipientId: string): number;
}
