import { nemisBridge } from '@/services/nemis-bridge';
import type { SchoolAdminRecord, StudentListItemResult, TeacherResult } from '@nemis-desktop/types';

async function listAll(
  collection: 'conversations' | 'messages' | 'guardians' | 'student_guardians',
): Promise<SchoolAdminRecord[]> {
  const result = await nemisBridge.listSchoolAdminRecords({ collection, limit: 250 });
  return result.items;
}

const str = (v: SchoolAdminRecord[string] | undefined): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: SchoolAdminRecord[string] | undefined): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const bool = (v: SchoolAdminRecord[string] | undefined): boolean => v === true || v === 1 || v === '1';

/** Every school-admin-facing role label a message/conversation participant can
 * carry — mirrors the real `SystemRole` values the backend stamps onto
 * `messages.senderRole` (see SchoolAdminModuleService: `record.senderRole =
 * active.user.role`). */
export const SENDER_ROLE_LABEL: Record<string, string> = {
  INSTITUTION_ADMIN: 'School Admin',
  TEACHER: 'Teacher',
  PARENT: 'Guardian',
  COUNTY_ADMIN: 'County Admin',
  DEO: 'District Education Officer',
  MINISTRY_ADMIN: 'Ministry Admin',
};

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface ConversationRow {
  id: string;
  studentId: string;
  teacherId: string;
  subject: string | null;
  lastMessageAt: string | null;
  studentName: string;
  teacherName: string;
  guardianName: string | null;
  unreadCount: number;
  lastMessagePreview: string | null;
}

function toMessageRow(r: SchoolAdminRecord): MessageRow {
  return {
    id: str(r.id), conversationId: str(r.conversationId), senderId: str(r.senderId),
    senderRole: str(r.senderRole), content: str(r.content), isRead: bool(r.isRead), createdAt: str(r.createdAt),
  };
}

/** `guardians` + `student_guardians` are joined client-side to resolve a
 * student's primary guardian name — the same pattern already used by
 * guardians/shared.tsx's `buildGuardianRows` (no dedicated guardian-lookup
 * API exists, only the generic offline collection bridge). */
function buildPrimaryGuardianNameMap(
  guardianRecords: SchoolAdminRecord[],
  linkRecords: SchoolAdminRecord[],
): Map<string, string> {
  const guardianNameById = new Map<string, string>();
  for (const g of guardianRecords) {
    const id = str(g.id);
    if (id) guardianNameById.set(id, `${str(g.firstName)} ${str(g.lastName)}`.trim());
  }
  const primaryByStudent = new Map<string, string>();
  for (const link of linkRecords) {
    const studentId = str(link.studentId);
    const guardianId = str(link.guardianId);
    if (!studentId || !guardianId) continue;
    if (bool(link.isPrimary) || !primaryByStudent.has(studentId)) {
      const name = guardianNameById.get(guardianId);
      if (name) primaryByStudent.set(studentId, name);
    }
  }
  return primaryByStudent;
}

/** Builds the enriched conversation list for the sidebar: real conversations
 * joined against real student/teacher directories plus the guardian lookup
 * above, with unread counts computed from the real `messages` collection
 * (unread = not sent by the signed-in admin, isRead false). */
export async function loadConversations(currentUserId: string): Promise<ConversationRow[]> {
  const [conversations, allMessages, guardianRecords, linkRecords, studentsPage, teachersPage] = await Promise.all([
    listAll('conversations'),
    listAll('messages'),
    listAll('guardians'),
    listAll('student_guardians'),
    nemisBridge.listStudents({ limit: 2000 }),
    nemisBridge.listTeachers({ limit: 2000 }),
  ]);

  const studentNameById = new Map(studentsPage.items.map((s: StudentListItemResult) => [s.id, s.fullName]));
  const teacherNameById = new Map(teachersPage.items.map((t: TeacherResult) => [t.id, `${t.firstName} ${t.lastName}`]));
  const guardianNameByStudent = buildPrimaryGuardianNameMap(guardianRecords, linkRecords);

  const messagesByConversation = new Map<string, MessageRow[]>();
  for (const raw of allMessages) {
    const m = toMessageRow(raw);
    if (!m.conversationId) continue;
    const list = messagesByConversation.get(m.conversationId) ?? [];
    list.push(m);
    messagesByConversation.set(m.conversationId, list);
  }

  return conversations
    .map((c) => {
      const id = str(c.id);
      const studentId = str(c.studentId);
      const teacherId = str(c.teacherId);
      const thread = (messagesByConversation.get(id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const last = thread[thread.length - 1];
      const unreadCount = thread.filter((m) => !m.isRead && m.senderId !== currentUserId).length;
      return {
        id, studentId, teacherId,
        subject: strOrNull(c.subject),
        lastMessageAt: strOrNull(c.lastMessageAt),
        studentName: studentNameById.get(studentId) ?? 'Unknown Student',
        teacherName: teacherNameById.get(teacherId) ?? 'Unknown Teacher',
        guardianName: guardianNameByStudent.get(studentId) ?? null,
        unreadCount,
        lastMessagePreview: last?.content ?? null,
      };
    })
    .filter((c) => c.id)
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
}

export async function loadMessagesForConversation(conversationId: string): Promise<MessageRow[]> {
  const all = await listAll('messages');
  return all
    .filter((r) => r.conversationId === conversationId)
    .map(toMessageRow)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Idempotent — `conversations` has a real `UNIQUE(studentId,teacherId)`
 * constraint (see migration 011), so this finds-or-creates exactly like
 * finance/shared.tsx's `getOrCreateObligation`. */
export async function getOrCreateConversation(params: { studentId: string; teacherId: string; subject?: string }): Promise<SchoolAdminRecord> {
  const rows = await listAll('conversations');
  const existing = rows.find((r) => r.studentId === params.studentId && r.teacherId === params.teacherId);
  if (existing) return existing;
  return nemisBridge.saveSchoolAdminRecord({
    collection: 'conversations',
    record: { studentId: params.studentId, teacherId: params.teacherId, subject: params.subject || null, lastMessageAt: null },
  });
}

/** `senderId`/`senderRole` are stamped server-side from the signed-in session
 * (SchoolAdminModuleService: `record.senderId = userId; record.senderRole =
 * active.user.role`) — passing them here would just be overwritten, so they
 * are omitted from the write. */
export async function sendMessage(params: { conversationId: string; content: string }): Promise<SchoolAdminRecord> {
  const message = await nemisBridge.saveSchoolAdminRecord({
    collection: 'messages',
    record: { conversationId: params.conversationId, content: params.content, isRead: false, readAt: null },
  });
  await nemisBridge.saveSchoolAdminRecord({
    collection: 'conversations',
    record: { id: params.conversationId, lastMessageAt: new Date().toISOString() },
  });
  return message;
}

export async function markMessagesRead(messageIds: string[]): Promise<void> {
  await Promise.all(
    messageIds.map((id) =>
      nemisBridge.saveSchoolAdminRecord({ collection: 'messages', record: { id, isRead: true, readAt: new Date().toISOString() } }),
    ),
  );
}

export function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
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
