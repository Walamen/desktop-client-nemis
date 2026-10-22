/** One row in the Header notification bell dropdown. */
export interface HeaderNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  createdAt: string;
}

/** Unread count plus the most recent notifications for the Header bell. */
export interface HeaderNotificationsSummary {
  unread: number;
  recent: HeaderNotification[];
}
