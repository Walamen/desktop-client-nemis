import {
  IpcChannels,
  type CountySendMessageRequest,
  type CountyStartConversationRequest,
} from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import {
  assertCountySendMessageArgs,
  assertCountyStartConversationArgs,
  assertNoArgs,
  assertOnlineUsersArgs,
  assertSingleIdArg,
} from '@app/security/validateIpc';
import { runOnline } from '../school-admin/online';

export type CountyMessagingGateway = Pick<
  BackendProvisioningGateway,
  'startDirectConversation' | 'sendDirectMessage' | 'markDirectConversationRead'
>;

/** Who the live socket says is online (RealtimeClient). */
export interface PresenceSource {
  onlineUsers(userIds: string[]): Promise<string[]>;
}

/** County Messages. Reads are local (synced conversations); start, send and
 * mark-read are online-only commands followed by a forced pull, which is the
 * only writer of local truth. */
export function registerCountyMessagingHandlers(
  handle: IpcHandle,
  app: ApplicationLayer,
  gateway: CountyMessagingGateway,
  refresh: () => Promise<boolean>,
  presence: PresenceSource,
): void {
  handle(IpcChannels.COUNTY_MESSAGING_OVERVIEW, assertNoArgs, async () => (await app.county.getMessagingOverview()).data);
  handle(IpcChannels.COUNTY_MESSAGING_MESSAGES, assertSingleIdArg, async (conversationId: string) =>
    (await app.county.listDirectMessages(conversationId)).data,
  );
  handle(IpcChannels.COUNTY_MESSAGING_START, assertCountyStartConversationArgs, (request: CountyStartConversationRequest) =>
    runOnline(
      () => gateway.startDirectConversation({ targetUserId: request.targetUserId, initialMessage: request.initialMessage.trim() }),
      refresh,
    ),
  );
  handle(IpcChannels.COUNTY_MESSAGING_SEND, assertCountySendMessageArgs, (request: CountySendMessageRequest) =>
    runOnline(
      () => gateway.sendDirectMessage({ conversationId: request.conversationId, content: request.content.trim() }),
      refresh,
    ),
  );
  handle(IpcChannels.COUNTY_MESSAGING_MARK_READ, assertSingleIdArg, (conversationId: string) =>
    runOnline(() => gateway.markDirectConversationRead(conversationId), refresh),
  );
  handle(IpcChannels.MESSAGING_ONLINE_USERS, assertOnlineUsersArgs, (userIds: string[]) => presence.onlineUsers(userIds));
}
