import type { CountyApplicationService } from '@nemis-desktop/application';
import type {
  CountyDirectMessage,
  CountyMessageRecipient,
  CountyMessagingOverview,
  RealtimeEvent,
} from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyMessagesState {
  readonly overview: AsyncState<CountyMessagingOverview>;
  /** The open conversation's thread; idle while a new contact is pending. */
  readonly messages: AsyncState<CountyDirectMessage[] | null>;
  readonly selectedConversationId: string | null;
  /** A contact with no conversation yet: the first send starts one. */
  readonly pendingRecipient: CountyMessageRecipient | null;
  /** From the live socket; empty offline. */
  readonly onlineUserIds: readonly string[];
}

export interface CountyMessagesViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Messages page (reads). Start/send/mark-read are online commands
 * the page sends through the bridge, then reloads here (Districts precedent). */
export class CountyMessagesViewModel {
  readonly store = createStore<CountyMessagesState>(() => ({
    overview: idleState(),
    messages: idleState(),
    selectedConversationId: null,
    pendingRecipient: null,
    onlineUserIds: [],
  }));

  constructor(private readonly deps: CountyMessagesViewModelDeps) {}

  async loadOverview(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().overview, set: (overview) => this.store.setState({ overview }) },
      fetch: () => this.deps.county.getMessagingOverview(),
      map: (result) => result,
    });
  }

  async select(recipient: CountyMessageRecipient, conversationId: string | null): Promise<void> {
    if (!conversationId) {
      this.store.setState({ selectedConversationId: null, pendingRecipient: recipient, messages: idleState() });
      return;
    }
    this.store.setState({ selectedConversationId: conversationId, pendingRecipient: null, messages: idleState() });
    await this.reloadThread();
  }

  /** After the first message to a pending contact: open the conversation the pull brought in. */
  async selectByUserId(userId: string): Promise<void> {
    const overview = this.store.getState().overview;
    if (overview.status !== 'success' && overview.status !== 'refreshing') return;
    const conversation = overview.data.conversations.find((c) => c.counterpart.userId === userId);
    const recipient = overview.data.recipients.find((r) => r.userId === userId);
    if (conversation) {
      await this.select(
        recipient ?? {
          userId,
          firstName: conversation.counterpart.firstName,
          lastName: conversation.counterpart.lastName,
          photoUrl: conversation.counterpart.photoUrl,
          role: conversation.counterpart.role,
          districtId: null,
          districtName: null,
          institutionId: null,
          institutionName: conversation.counterpart.institutionName,
        },
        conversation.id,
      );
    }
  }

  async reloadThread(): Promise<void> {
    const conversationId = this.store.getState().selectedConversationId;
    if (!conversationId) return;
    await trackQuery({
      access: { get: () => this.store.getState().messages, set: (messages) => this.store.setState({ messages }) },
      fetch: () => this.deps.county.listDirectMessages(conversationId),
      map: (rows) => rows,
    });
  }

  setOnlineUsers(userIds: readonly string[]): void {
    this.store.setState({ onlineUserIds: [...new Set(userIds)] });
  }

  async onRealtime(event: RealtimeEvent): Promise<void> {
    if (event.type === 'presence') {
      const others = this.store.getState().onlineUserIds.filter((id) => id !== event.userId);
      this.store.setState({ onlineUserIds: event.online ? [...others, event.userId] : others });
      return;
    }
    if (event.type === 'message' || event.type === 'synced') {
      await Promise.all([this.loadOverview(), this.reloadThread()]);
    }
  }
}
