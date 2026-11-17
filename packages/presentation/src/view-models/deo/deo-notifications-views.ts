/** DEO Notifications display rules; the web keeps the same in
 * portal-web lib/deo-notifications.ts. */

export type DeoCardType = 'ALERT' | 'WARNING' | 'REPORT' | 'INFO' | 'MESSAGE' | 'ANNOUNCEMENT' | 'SUCCESS';

const CARD_TYPE: Record<string, DeoCardType> = {
  NEW_MESSAGE: 'MESSAGE',
  REPORT_SUBMITTED: 'REPORT',
  REPORT_CARD_PUBLISHED: 'REPORT',
  SYSTEM_ANNOUNCEMENT: 'ANNOUNCEMENT',
  GENERAL_ALERT: 'ALERT',
  DEADLINE_REMINDER: 'WARNING',
  BULK_UPLOAD_FAILED: 'WARNING',
  SCHOOL_REJECTED: 'WARNING',
  STUDENT_TRANSFER_REJECTED: 'WARNING',
  DEO_UNASSIGNED: 'WARNING',
  TRANSFER_CANCELLED: 'WARNING',
  SCHOOL_APPROVED: 'SUCCESS',
  STUDENT_TRANSFER_APPROVED: 'SUCCESS',
  BULK_UPLOAD_COMPLETED: 'SUCCESS',
  DEO_ASSIGNED: 'SUCCESS',
};

export function notificationCardType(type: string): DeoCardType {
  return CARD_TYPE[type] ?? 'INFO';
}

const DEO = '/government/deo';

/** A notification's stored link as a DEO route, or null to hide Open. The
 * server stores other portals' paths: `/messages/<id>` for a new message,
 * `/deo/dashboard` for an assignment. */
export function deoNotificationLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return null;
  const message = /^\/messages\/([^/?#]+)$/.exec(link);
  if (message) return `${DEO}/messages?conv=${encodeURIComponent(decodeURIComponent(message[1]!))}`;
  if (link === '/deo' || link === '/deo/dashboard') return DEO;
  const [path = ''] = link.split('?');
  if (path === DEO || path.startsWith(`${DEO}/`)) return link;
  return null;
}

export type DeoNotificationFilter = 'ALL' | 'UNREAD' | DeoCardType;

const ORDER: { value: DeoCardType; label: string }[] = [
  { value: 'ALERT', label: 'Alert' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'REPORT', label: 'Report' },
  { value: 'INFO', label: 'Info' },
  { value: 'MESSAGE', label: 'Message' },
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
  { value: 'SUCCESS', label: 'Success' },
];

/** All and Unread, then each card type present, with counts. */
export function notificationFilterOptions(
  items: readonly { type: string }[],
  totals: { total: number; unread: number },
): { value: DeoNotificationFilter; label: string; count: number }[] {
  const counts = new Map<DeoCardType, number>();
  for (const item of items) {
    const card = notificationCardType(item.type);
    counts.set(card, (counts.get(card) ?? 0) + 1);
  }
  return [
    { value: 'ALL', label: 'All', count: totals.total },
    { value: 'UNREAD', label: 'Unread', count: totals.unread },
    ...ORDER.filter((option) => counts.has(option.value)).map((option) => ({
      ...option,
      count: counts.get(option.value)!,
    })),
  ];
}

export function matchesNotificationFilter(item: { type: string; isRead: boolean }, filter: DeoNotificationFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'UNREAD') return !item.isRead;
  return notificationCardType(item.type) === filter;
}
