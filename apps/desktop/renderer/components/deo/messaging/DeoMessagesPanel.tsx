'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Crown, MessageSquare, Search } from 'lucide-react';
import type { CountyDirectConversation, CountyMessageRecipient, CountyMessagingOverview } from '@nemis-desktop/types';
import { useDeoMessagesViewModel } from '@/lib/presentation/hooks/deo';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useRealtime } from '@/hooks/use-realtime';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { deoBridge } from '@/services/nemis-bridge/deo';
import { MessageThread } from '@/components/county/messaging/MessageThread';
import { ConversationListItem } from '@/components/county/messaging/ConversationListItem';
import { SidebarContactItem } from '@/components/county/messaging/SidebarContactItem';
import { buildSidebarItems, counterpartAsRecipient } from '@/components/county/messaging/sidebar-items';

type RoleFilter = 'ALL' | 'COUNTY_ADMIN' | 'INSTITUTION_ADMIN';

const ROLE_LABELS: Record<RoleFilter, string> = {
  ALL: 'All',
  COUNTY_ADMIN: 'County Admin',
  INSTITUTION_ADMIN: 'School Admin',
};

const EMPTY: CountyMessagingOverview = { recipients: [], conversations: [] };

function initials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function PinnedCountyAdmin({
  recipient,
  conversation,
  isSelected,
  isOnline,
  onSelect,
}: {
  recipient: CountyMessageRecipient;
  conversation: CountyDirectConversation | null;
  isSelected: boolean;
  isOnline: boolean;
  onSelect: () => void;
}) {
  const unread = conversation?.unreadCount ?? 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-amber-50 border-b border-gray-200 ${
        isSelected ? 'bg-amber-50 border-l-2 border-l-amber-500' : ''
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">
          {initials(recipient.firstName, recipient.lastName)}
        </div>
        {isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" aria-hidden />
            <p className="text-sm font-semibold text-gray-900 truncate">
              {recipient.firstName} {recipient.lastName}
            </p>
            {isOnline && <span className="flex-shrink-0 text-xs text-green-600 font-medium">Active</span>}
          </div>
          {unread > 0 && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-xs flex items-center justify-center px-1">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
        <p className="text-xs text-amber-700 font-medium">County Admin</p>
        {conversation?.lastMessage && <p className="text-xs text-gray-400 truncate mt-0.5">{conversation.lastMessage}</p>}
      </div>
    </button>
  );
}

function SectionStrip({ label }: { label: string }) {
  return (
    <div className="px-4 py-1.5 bg-gray-50 border-y border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}

/** Port of portal-web components/messaging/DeoDirectMessagePanel.tsx. Reads
 * come from this device; sending and mark-read go to the server and are
 * offered only online. `?userId=` opens that person (the School Admins page's
 * Message button), `?conv=` opens a conversation. */
export function DeoMessagesPanel() {
  const vm = useDeoMessagesViewModel();
  const state = useViewModel(vm.store, (s) => s);
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useRevalidateOnSync(() => {
    void vm.loadOverview();
    void vm.reloadThread();
  }, []);
  useRealtime((event) => void vm.onRealtime(event));

  const overviewReady = state.overview.status === 'success' || state.overview.status === 'refreshing';
  const { recipients, conversations } = overviewReady ? state.overview.data : EMPTY;

  // Seed presence for everyone in the sidebar (the socket runs only online).
  const allUserIds = useMemo(() => recipients.map((r) => r.userId), [recipients]);
  useEffect(() => {
    if (!online || allUserIds.length === 0) return;
    let cancelled = false;
    deoBridge
      .getOnlineUsers(allUserIds)
      .then((ids) => {
        if (!cancelled) vm.setOnlineUsers(ids);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [online, allUserIds, vm]);

  function handleSelectItem(recipient: CountyMessageRecipient, conversationId: string | null) {
    setMessageText('');
    setSendError(null);
    void vm.select(recipient, conversationId);
  }

  // Deep links, once the overview is on screen.
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get('userId');
  const targetConversationId = searchParams.get('conv');
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !overviewReady) return;
    deepLinkedRef.current = true;
    if (targetUserId) {
      const recipient = recipients.find((r) => r.userId === targetUserId);
      if (!recipient) return;
      const conv = conversations.find((c) => c.counterpart.userId === recipient.userId);
      handleSelectItem(recipient, conv?.id ?? null);
      if (recipient.role === 'COUNTY_ADMIN' || recipient.role === 'INSTITUTION_ADMIN') setRoleFilter(recipient.role);
      return;
    }
    if (targetConversationId) {
      const conv = conversations.find((c) => c.id === targetConversationId);
      if (!conv) return;
      const recipient = recipients.find((r) => r.userId === conv.counterpart.userId) ?? counterpartAsRecipient(conv);
      handleSelectItem(recipient, conv.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the overview first arrives
  }, [overviewReady]);

  // Opening a conversation marks it read on the server (online only); the
  // pull then clears the unread badge locally.
  const selectedConversationId = state.selectedConversationId;
  useEffect(() => {
    if (!selectedConversationId || !online) return;
    deoBridge
      .markConversationRead(selectedConversationId)
      .then(() => vm.loadOverview())
      .catch(() => undefined);
  }, [selectedConversationId, online, vm]);

  const convByUserId = useMemo(() => new Map(conversations.map((c) => [c.counterpart.userId, c])), [conversations]);
  const countyAdmins = recipients.filter((r) => r.role === 'COUNTY_ADMIN');
  // School Admins: conversations first (newest), then by name; past
  // conversations with people who are no longer contacts last.
  const { schoolAdminItems, pastItems } = useMemo(() => {
    const reachable = new Set(recipients.map((r) => r.userId));
    const items = buildSidebarItems(
      recipients.filter((r) => r.role === 'INSTITUTION_ADMIN'),
      conversations,
    );
    return {
      schoolAdminItems: items.filter((item) => reachable.has(item.recipient.userId)),
      pastItems: items.filter((item) => !reachable.has(item.recipient.userId) && item.conversation),
    };
  }, [recipients, conversations]);

  const matchesSearch = (recipient: CountyMessageRecipient) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${recipient.firstName} ${recipient.lastName} ${recipient.institutionName ?? ''}`.toLowerCase().includes(q);
  };
  const showCountyAdmins = roleFilter === 'ALL' || roleFilter === 'COUNTY_ADMIN';
  const showSchoolAdmins = roleFilter === 'ALL' || roleFilter === 'INSTITUTION_ADMIN';
  const visibleSchoolAdmins = schoolAdminItems.filter(({ recipient }) => matchesSearch(recipient));
  const visiblePast = roleFilter === 'ALL' ? pastItems.filter(({ recipient }) => matchesSearch(recipient)) : [];
  const totalVisible =
    (showCountyAdmins ? countyAdmins.length : 0) + (showSchoolAdmins ? visibleSchoolAdmins.length : 0);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId) ?? null;
  const pendingContact = state.pendingRecipient;

  const handleSend = async () => {
    const content = messageText.trim();
    if (sending || !content || !online) return;
    const conversationId = selectedConversationId;
    const contact = pendingContact;
    if (!conversationId && !contact) return;
    setMessageText('');
    setSendError(null);
    setSending(true);
    try {
      if (conversationId) {
        await deoBridge.sendDirectMessage({ conversationId, content });
        await Promise.all([vm.loadOverview(), vm.reloadThread()]);
      } else if (contact) {
        await deoBridge.startConversation({ targetUserId: contact.userId, initialMessage: content });
        await vm.loadOverview();
        await vm.selectByUserId(contact.userId);
      }
    } catch (error) {
      setMessageText(content);
      setSendError(parseIpcError(error)?.message ?? 'The message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const headerInfo = selectedConversation
    ? {
        firstName: selectedConversation.counterpart.firstName,
        lastName: selectedConversation.counterpart.lastName,
        role: selectedConversation.counterpart.role,
        institutionName: selectedConversation.counterpart.institutionName,
      }
    : pendingContact
      ? {
          firstName: pendingContact.firstName,
          lastName: pendingContact.lastName,
          role: pendingContact.role,
          institutionName: pendingContact.institutionName,
        }
      : null;

  const activeUserId = selectedConversation?.counterpart.userId ?? pendingContact?.userId;
  const isCounterpartOnline = activeUserId ? state.onlineUserIds.includes(activeUserId) : false;
  const isSidebarLoading = state.overview.status === 'idle' || state.overview.status === 'loading';
  const messages =
    state.messages.status === 'success' || state.messages.status === 'refreshing' ? (state.messages.data ?? []) : [];

  const isSelected = (recipient: CountyMessageRecipient, conversation: CountyDirectConversation | null) =>
    (conversation !== null && conversation.id === (selectedConversation?.id ?? null)) ||
    (pendingContact?.userId === recipient.userId && !selectedConversation);

  const renderItem = (recipient: CountyMessageRecipient, conversation: CountyDirectConversation | null) => {
    const isOnline = state.onlineUserIds.includes(recipient.userId);
    if (conversation) {
      return (
        <ConversationListItem
          key={conversation.id}
          conversation={conversation}
          isSelected={isSelected(recipient, conversation)}
          isOnline={isOnline}
          onSelect={() => handleSelectItem(recipient, conversation.id)}
        />
      );
    }
    return (
      <SidebarContactItem
        key={recipient.userId}
        recipient={recipient}
        isSelected={isSelected(recipient, null)}
        isOnline={isOnline}
        onSelect={() => handleSelectItem(recipient, null)}
      />
    );
  };

  return (
    <div className="flex h-[calc(100vh-140px)] border border-slate-300 bg-white overflow-hidden">
      <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-200">
          <MessageSquare className="w-5 h-5 text-primary" aria-hidden />
          <h2 className="text-base font-semibold text-gray-900">Messages</h2>
          {!isSidebarLoading && (
            <span className="ml-auto text-xs text-gray-400">
              {totalVisible} contact{totalVisible !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {showSchoolAdmins && (
          <div className="px-3 pt-2 pb-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search school admins…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
          </div>
        )}

        <div className="flex gap-1 px-3 py-1.5">
          {(['ALL', 'COUNTY_ADMIN', 'INSTITUTION_ADMIN'] as RoleFilter[]).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={roleFilter === r}
              onClick={() => setRoleFilter(r)}
              className={`flex-1 py-1 text-xs font-medium transition-colors ${
                roleFilter === r ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto border-t border-gray-100">
          {isSidebarLoading ? (
            <div className="flex flex-col gap-3 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-2 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : state.overview.status === 'error' ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2 px-4">
              <AlertTriangle className="w-5 h-5" aria-hidden />
              <p className="text-xs text-center">Failed to load messages.</p>
              <button type="button" onClick={() => void vm.loadOverview()} className="text-xs underline text-error">
                Retry
              </button>
            </div>
          ) : (
            <>
              {showCountyAdmins &&
                countyAdmins.map((recipient) => (
                  <PinnedCountyAdmin
                    key={recipient.userId}
                    recipient={recipient}
                    conversation={convByUserId.get(recipient.userId) ?? null}
                    isSelected={isSelected(recipient, convByUserId.get(recipient.userId) ?? null)}
                    isOnline={state.onlineUserIds.includes(recipient.userId)}
                    onSelect={() => handleSelectItem(recipient, convByUserId.get(recipient.userId)?.id ?? null)}
                  />
                ))}
              {showCountyAdmins && countyAdmins.length === 0 && !showSchoolAdmins && (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2 px-4">
                  <AlertTriangle className="w-5 h-5" aria-hidden />
                  <p className="text-xs text-center">No county admin found.</p>
                </div>
              )}

              {showSchoolAdmins && (
                <>
                  {showCountyAdmins && <SectionStrip label={`School Admins (${schoolAdminItems.length})`} />}
                  {visibleSchoolAdmins.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2 px-4">
                      <AlertTriangle className="w-5 h-5" aria-hidden />
                      <p className="text-xs text-center">
                        {search.trim() ? 'No school admins match your search.' : 'No school admins in your district.'}
                      </p>
                    </div>
                  ) : (
                    visibleSchoolAdmins.map(({ recipient, conversation }) => renderItem(recipient, conversation))
                  )}
                </>
              )}

              {visiblePast.length > 0 && (
                <>
                  <SectionStrip label={`Past conversations (${visiblePast.length})`} />
                  {visiblePast.map(({ recipient, conversation }) => renderItem(recipient, conversation))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <MessageThread
          headerInfo={headerInfo}
          isOnline={isCounterpartOnline}
          messages={messages}
          messageText={messageText}
          msgsLoading={state.messages.status === 'loading'}
          msgsFetching={state.messages.status === 'refreshing'}
          sending={sending}
          pendingContact={pendingContact}
          canSend={online}
          sendError={sendError}
          onSend={() => void handleSend()}
          onMessageChange={setMessageText}
        />
      </div>
    </div>
  );
}
