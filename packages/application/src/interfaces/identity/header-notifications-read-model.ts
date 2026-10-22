import type { HeaderNotificationsSummary } from '@nemis-desktop/types';

/** How many recent notifications the Header bell dropdown shows. */
export const HEADER_NOTIFICATIONS_LIMIT = 5;

export interface IHeaderNotificationsReadModel {
  /** Unread count and the `limit` most recent notifications for the recipient. */
  summary(recipientId: string, limit: number): HeaderNotificationsSummary;
}
