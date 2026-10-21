import type { CountyDirectConversation, CountyMessageRecipient } from '@nemis-desktop/types';

/** Port of portal-web components/messaging/sidebar-items.ts. */
export interface SidebarItem {
  recipient: CountyMessageRecipient;
  conversation: CountyDirectConversation | null;
}

const byLastMessage = (a: SidebarItem, b: SidebarItem) =>
  new Date(b.conversation?.lastMessageAt ?? 0).getTime() - new Date(a.conversation?.lastMessageAt ?? 0).getTime();

/**
 * The messaging sidebar: conversations with reachable people by last message,
 * then everyone else reachable by name, then past conversations whose person
 * is no longer reachable (moved, deactivated), so their history stays readable.
 */
export function buildSidebarItems(
  recipients: CountyMessageRecipient[],
  conversations: CountyDirectConversation[],
): SidebarItem[] {
  const convByUserId = new Map(conversations.map((c) => [c.counterpart.userId, c]));
  const reachable = new Set(recipients.map((r) => r.userId));
  const items = recipients.map((recipient) => ({ recipient, conversation: convByUserId.get(recipient.userId) ?? null }));
  const withConversation = items.filter((i) => i.conversation).sort(byLastMessage);
  const contacts = items
    .filter((i) => !i.conversation)
    .sort((a, b) =>
      `${a.recipient.firstName} ${a.recipient.lastName}`.localeCompare(`${b.recipient.firstName} ${b.recipient.lastName}`),
    );
  const past = conversations
    .filter((c) => !reachable.has(c.counterpart.userId))
    .map((c) => ({ recipient: counterpartAsRecipient(c), conversation: c }))
    .sort(byLastMessage);
  return [...withConversation, ...contacts, ...past];
}

export function counterpartAsRecipient(c: CountyDirectConversation): CountyMessageRecipient {
  return {
    userId: c.counterpart.userId,
    firstName: c.counterpart.firstName,
    lastName: c.counterpart.lastName,
    photoUrl: c.counterpart.photoUrl,
    role: c.counterpart.role,
    districtId: null,
    districtName: null,
    institutionId: null,
    institutionName: c.counterpart.institutionName,
  };
}
