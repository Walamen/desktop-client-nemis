import { IpcChannels } from '@nemis-desktop/types';
import type { CountyApi } from '@nemis-desktop/types';
import { invoke } from '../invoke';

export const countyMessagingApi: Pick<
  CountyApi,
  | 'getMessagingOverview'
  | 'listDirectMessages'
  | 'startConversation'
  | 'sendDirectMessage'
  | 'markConversationRead'
  | 'getOnlineUsers'
  | 'listNotifications'
  | 'markNotificationRead'
  | 'markAllNotificationsRead'
> = {
  getMessagingOverview: () => invoke(IpcChannels.COUNTY_MESSAGING_OVERVIEW),
  listDirectMessages: (conversationId) => invoke(IpcChannels.COUNTY_MESSAGING_MESSAGES, conversationId),
  startConversation: (request) => invoke(IpcChannels.COUNTY_MESSAGING_START, request),
  sendDirectMessage: (request) => invoke(IpcChannels.COUNTY_MESSAGING_SEND, request),
  markConversationRead: (conversationId) => invoke(IpcChannels.COUNTY_MESSAGING_MARK_READ, conversationId),
  getOnlineUsers: (userIds) => invoke(IpcChannels.MESSAGING_ONLINE_USERS, userIds),
  listNotifications: (query) => invoke(IpcChannels.COUNTY_NOTIFICATIONS_LIST, query),
  markNotificationRead: (notificationId) => invoke(IpcChannels.COUNTY_NOTIFICATIONS_MARK_READ, notificationId),
  markAllNotificationsRead: () => invoke(IpcChannels.COUNTY_NOTIFICATIONS_MARK_ALL_READ),
};
