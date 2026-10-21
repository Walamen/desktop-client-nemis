import type {
  CountyDirectMessage,
  CountyMessagingOverview,
  CountyNotificationsPage,
  CountyNotificationsQuery,
  CountySendMessageRequest,
  CountyStartConversationRequest,
  OnlineCommandResult,
} from '@nemis-desktop/types';
import { api } from '../api';

export const messagingBridge = {
  getMessagingOverview: (): Promise<CountyMessagingOverview> => api().county.getMessagingOverview(),
  listDirectMessages: (conversationId: string): Promise<CountyDirectMessage[] | null> =>
    api().county.listDirectMessages(conversationId),
  startConversation: (request: CountyStartConversationRequest): Promise<OnlineCommandResult<null>> =>
    api().county.startConversation(request),
  sendDirectMessage: (request: CountySendMessageRequest): Promise<OnlineCommandResult<null>> =>
    api().county.sendDirectMessage(request),
  markConversationRead: (conversationId: string): Promise<OnlineCommandResult<null>> =>
    api().county.markConversationRead(conversationId),
  getOnlineUsers: (userIds: string[]): Promise<string[]> => api().county.getOnlineUsers(userIds),
  listNotifications: (query: CountyNotificationsQuery): Promise<CountyNotificationsPage> =>
    api().county.listNotifications(query),
  markNotificationRead: (notificationId: string): Promise<boolean> => api().county.markNotificationRead(notificationId),
  markAllNotificationsRead: (): Promise<number> => api().county.markAllNotificationsRead(),
};
