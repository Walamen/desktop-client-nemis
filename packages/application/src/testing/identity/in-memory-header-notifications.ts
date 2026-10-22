import type { HeaderNotificationsSummary } from '@nemis-desktop/types';
import type { IHeaderNotificationsReadModel } from '../../interfaces/identity/header-notifications-read-model';

/** Settable canned summaries per recipient; records the last limit asked for. */
export class InMemoryHeaderNotificationsReadModel implements IHeaderNotificationsReadModel {
  readonly summaries = new Map<string, HeaderNotificationsSummary>();
  lastLimit: number | null = null;

  summary(recipientId: string, limit: number): HeaderNotificationsSummary {
    this.lastLimit = limit;
    return this.summaries.get(recipientId) ?? { unread: 0, recent: [] };
  }
}
