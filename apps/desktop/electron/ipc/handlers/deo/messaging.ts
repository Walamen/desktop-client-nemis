import {
  IpcChannels,
  type CountySendMessageRequest,
  type CountyStartConversationRequest,
} from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertCountySendMessageArgs,
  assertCountyStartConversationArgs,
  assertNoArgs,
  assertSingleIdArg,
} from '@app/security/validateIpc';
import { runOnline } from '../school-admin/online';
import type { CountyMessagingGateway } from '../county/messaging';

/** DEO Messages and Notifications. Reads are local (synced conversations and
 * notifications); start, send and mark-read of a conversation are online-only
 * commands followed by a forced pull, as on the County page. Marking a
 * notification read is local and pushed by the outbox. Presence
 * (messaging:online-users) is shared with County and registered there. */
export function registerDeoMessagingHandlers(
  handle: IpcHandle,
  app: ApplicationLayer,
  gateway: CountyMessagingGateway,
  refresh: () => Promise<boolean>,
): void {
  handle(IpcChannels.DEO_MESSAGING_OVERVIEW, assertNoArgs, async () => (await app.deo.getMessagingOverview()).data);
  handle(IpcChannels.DEO_MESSAGING_MESSAGES, assertSingleIdArg, async (conversationId: string) =>
    (await app.deo.listDirectMessages(conversationId)).data,
  );
  handle(IpcChannels.DEO_MESSAGING_START, assertCountyStartConversationArgs, (request: CountyStartConversationRequest) =>
    runOnline(
      () => gateway.startDirectConversation({ targetUserId: request.targetUserId, initialMessage: request.initialMessage.trim() }),
      refresh,
    ),
  );
  handle(IpcChannels.DEO_MESSAGING_SEND, assertCountySendMessageArgs, (request: CountySendMessageRequest) =>
    runOnline(
      () => gateway.sendDirectMessage({ conversationId: request.conversationId, content: request.content.trim() }),
      refresh,
    ),
  );
  handle(IpcChannels.DEO_MESSAGING_MARK_READ, assertSingleIdArg, (conversationId: string) =>
    runOnline(() => gateway.markDirectConversationRead(conversationId), refresh),
  );
  handle(IpcChannels.DEO_NOTIFICATIONS_LIST, assertNoArgs, async () => (await app.deo.listNotifications()).data);
  handle(IpcChannels.DEO_NOTIFICATIONS_MARK_READ, assertSingleIdArg, async (notificationId: string) =>
    (await app.deo.markNotificationRead(notificationId)).data,
  );
  handle(IpcChannels.DEO_NOTIFICATIONS_MARK_ALL_READ, assertNoArgs, async () =>
    (await app.deo.markAllNotificationsRead()).data,
  );
}
