import { nemisBridge } from '@/services/nemis-bridge';
import type { SchoolAdminRecord } from '@nemis-desktop/types';

export interface NotificationTypeMeta {
  label: string;
  color: string;
  bgColor: string;
}

/** Ported verbatim from portal-web's lib/notificationMeta.ts — this is purely
 * presentational metadata (label + Tailwind colors) describing the real
 * `type` values that already exist on synced `user_notifications` rows, not
 * fabricated data. Single source of truth kept in sync with the type union
 * defined in @nemis/types' UserNotificationType. */
export const NOTIFICATION_TYPE_META: Record<string, NotificationTypeMeta> = {
  ACCOUNT_CREATED: { label: 'Account', color: 'text-slate-600', bgColor: 'bg-slate-100' },
  SCHOOL_APPROVAL_REQUESTED: { label: 'Approval', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  SCHOOL_APPROVED: { label: 'Approval', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  SCHOOL_REJECTED: { label: 'Rejection', color: 'text-red-600', bgColor: 'bg-red-100' },
  DEO_ASSIGNED: { label: 'Assignment', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  DEO_UNASSIGNED: { label: 'Assignment', color: 'text-slate-600', bgColor: 'bg-slate-100' },
  TEACHER_ASSIGNED: { label: 'Assignment', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  STUDENT_ENROLLED: { label: 'Enrollment', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  STUDENT_ABSENT: { label: 'Absence', color: 'text-red-600', bgColor: 'bg-red-100' },
  STUDENT_PRESENT: { label: 'Attendance', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  STUDENT_LATE: { label: 'Late Arrival', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  REPORT_CARD_PUBLISHED: { label: 'Report Card', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  NEW_MESSAGE: { label: 'Message', color: 'text-sky-600', bgColor: 'bg-sky-100' },
  BULK_UPLOAD_COMPLETED: { label: 'Upload', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  BULK_UPLOAD_FAILED: { label: 'Upload', color: 'text-red-600', bgColor: 'bg-red-100' },
  REPORT_SUBMITTED: { label: 'Report', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  SYSTEM_ANNOUNCEMENT: { label: 'Announcement', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  STUDENT_TRANSFER_REQUESTED: { label: 'Transfer', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  STUDENT_TRANSFER_APPROVED: { label: 'Transfer', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  STUDENT_TRANSFER_REJECTED: { label: 'Transfer', color: 'text-red-600', bgColor: 'bg-red-100' },
  DEADLINE_REMINDER: { label: 'Deadline', color: 'text-red-600', bgColor: 'bg-red-100' },
  GENERAL_ALERT: { label: 'Alert', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  EXAM_SCHEDULED: { label: 'Exam', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  ASSIGNMENT_POSTED: { label: 'Assignment', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  FEE_PAYMENT_DUE: { label: 'Fee Due', color: 'text-red-600', bgColor: 'bg-red-100' },
  GRADE_POSTED: { label: 'Grade', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  ASSIGNMENT_SUBMITTED: { label: 'Submission', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  GRADE_WINDOW_OPENED: { label: 'Grade Window', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  GRADE_WINDOW_CLOSED: { label: 'Grade Window', color: 'text-red-600', bgColor: 'bg-red-100' },
  EXAM_TIMETABLE_RELEASED: { label: 'Exam', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  TEACHER_REMARK: { label: 'Remark', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  NEW_TEACHER_REGISTERED: { label: 'Staff', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  FEE_PAYMENT_REMINDER: { label: 'Fee Reminder', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  RESOURCE_UPLOADED: { label: 'Resource', color: 'text-teal-600', bgColor: 'bg-teal-100' },
};

export function getNotificationMeta(type: string): NotificationTypeMeta {
  return NOTIFICATION_TYPE_META[type] ?? { label: 'Notification', color: 'text-slate-600', bgColor: 'bg-slate-100' };
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export interface NotificationRow {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

const str = (v: SchoolAdminRecord[string] | undefined): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: SchoolAdminRecord[string] | undefined): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const bool = (v: SchoolAdminRecord[string] | undefined): boolean => v === true || v === 1 || v === '1';

/** Notifications are server-issued (SchoolAdminModuleService forbids creating
 * `user_notifications` rows locally — "Notifications can only be created by
 * the server") and scoped to the signed-in user (`scope: 'recipient'`), so
 * this filters the synced-down rows to the current user's own, same as
 * portal-web's useGetUserNotificationsQuery would return for that user. */
export async function listMyNotifications(recipientId: string): Promise<NotificationRow[]> {
  const result = await nemisBridge.listSchoolAdminRecords({ collection: 'user_notifications', limit: 250 });
  return result.items
    .filter((r) => str(r.recipientId) === recipientId)
    .map((r) => ({
      id: str(r.id), recipientId: str(r.recipientId), type: str(r.type), title: str(r.title),
      message: str(r.message), isRead: bool(r.isRead), link: strOrNull(r.link), createdAt: str(r.createdAt),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The only field an owning user may change on an existing notification (see
 * SchoolAdminModuleService CONFIG: `user_notifications: { columns: ['isRead'] }`). */
export async function markNotificationRead(id: string): Promise<void> {
  await nemisBridge.saveSchoolAdminRecord({ collection: 'user_notifications', record: { id, isRead: true } });
}
