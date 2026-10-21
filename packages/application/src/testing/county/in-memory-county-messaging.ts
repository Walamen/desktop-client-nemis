import type {
  CountyDirectMessage,
  CountyMessagingOverview,
  CountyNotificationsPage,
  CountyNotificationsQuery,
} from '@nemis-desktop/types';
import type {
  ICountyMessagingReadModel,
  ICountyNotificationsRepository,
} from '../../interfaces/county/county-messaging-read-model';

/** Settable canned messaging data; records the user asked for. */
export class InMemoryCountyMessagingReadModel implements ICountyMessagingReadModel {
  overview: CountyMessagingOverview = { recipients: [], conversations: [] };
  messagesByConversation = new Map<string, CountyDirectMessage[]>();
  lastUserId: string | null = null;

  getOverview(currentUserId: string): CountyMessagingOverview {
    this.lastUserId = currentUserId;
    return this.overview;
  }

  listMessages(conversationId: string, currentUserId: string): CountyDirectMessage[] | null {
    this.lastUserId = currentUserId;
    return this.messagesByConversation.get(conversationId) ?? null;
  }
}

/** Settable canned notifications; records marks. */
export class InMemoryCountyNotificationsRepository implements ICountyNotificationsRepository {
  page: CountyNotificationsPage = {
    items: [], total: 0, totalAll: 0, unread: 0, alertsUnresolved: 0, page: 1, limit: 20,
  };
  /** recipientId → notification ids it owns. */
  owned = new Map<string, Set<string>>();
  marked: string[] = [];
  lastQuery: { recipientId: string; query: CountyNotificationsQuery } | null = null;

  list(recipientId: string, query: CountyNotificationsQuery): CountyNotificationsPage {
    this.lastQuery = { recipientId, query };
    return this.page;
  }

  markRead(recipientId: string, notificationId: string): boolean {
    if (!this.owned.get(recipientId)?.has(notificationId)) return false;
    this.marked.push(notificationId);
    return true;
  }

  markAllRead(recipientId: string): number {
    const ids = [...(this.owned.get(recipientId) ?? [])];
    this.marked.push(...ids);
    return ids.length;
  }
}
