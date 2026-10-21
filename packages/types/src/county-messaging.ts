/**
 * County (CEO) Messages page: direct messages with the county's DEOs and
 * School Admins, read from this device; sending is online-only
 * (docs/superpowers/specs/2026-10-21-county-messages-notifications-design.md).
 * Shapes follow portal-web's EligibleRecipient / DirectConversation / DirectMessage.
 */
export interface CountyMessageRecipient {
  userId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  role: string;
  districtId: string | null;
  districtName: string | null;
  institutionId: string | null;
  institutionName: string | null;
}

export interface CountyDirectConversation {
  id: string;
  lastMessageAt: string | null;
  createdAt: string;
  counterpart: {
    userId: string;
    firstName: string;
    lastName: string;
    photoUrl: string | null;
    role: string;
    institutionName: string | null;
  };
  lastMessage: string | null;
  unreadCount: number;
}

export interface CountyDirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  isOwn: boolean;
  senderName: string;
}

export interface CountyMessagingOverview {
  recipients: CountyMessageRecipient[];
  conversations: CountyDirectConversation[];
}

export interface CountyStartConversationRequest {
  targetUserId: string;
  initialMessage: string;
}

export interface CountySendMessageRequest {
  conversationId: string;
  content: string;
}
