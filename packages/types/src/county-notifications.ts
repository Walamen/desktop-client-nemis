/** County (CEO) Notifications page, read from this device's synced
 * notifications; marking read pushes through the normal outbox. */
export interface CountyNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

export type CountyNotificationsFilter = 'ALL' | 'UNREAD' | 'READ';

export interface CountyNotificationsQuery {
  filter: CountyNotificationsFilter;
  page: number;
  limit: number;
}

export interface CountyNotificationsPage {
  items: CountyNotification[];
  /** Matching the filter. */
  total: number;
  /** Every notification, whatever the filter. */
  totalAll: number;
  unread: number;
  /** Unresolved alerts in the county. */
  alertsUnresolved: number;
  page: number;
  limit: number;
}
