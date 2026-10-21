'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, AlertTriangle, Search, ChevronDown } from 'lucide-react';
import type { CountyMessageRecipient, CountyMessagingOverview } from '@nemis-desktop/types';
import { useCountyMessagesViewModel } from '@/lib/presentation/hooks/county';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useRealtime } from '@/hooks/use-realtime';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { countyBridge } from '@/services/nemis-bridge/county';
import { MessageThread } from './MessageThread';
import { ConversationListItem } from './ConversationListItem';
import { SidebarContactItem } from './SidebarContactItem';
import { buildSidebarItems, counterpartAsRecipient } from './sidebar-items';

type RoleFilter = 'ALL' | 'DEO' | 'INSTITUTION_ADMIN';

const ROLE_LABELS: Record<RoleFilter, string> = {
  ALL: 'All',
  DEO: 'DEO',
  INSTITUTION_ADMIN: 'School Admin',
};

const EMPTY: CountyMessagingOverview = { recipients: [], conversations: [] };

/** Port of portal-web components/messaging/CeoDirectMessagePanel.tsx. Reads
 * come from this device; sending and mark-read go to the server and are
 * offered only online. `?institutionId=` opens that school's admin, `?conv=`
 * opens a conversation. */
export function CountyMessagesPanel() {
  const vm = useCountyMessagesViewModel();
  const state = useViewModel(vm.store, (s) => s);
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [districtOpen, setDistrictOpen] = useState(false);
  const districtRef = useRef<HTMLDivElement>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useRevalidateOnSync(() => {
    void vm.loadOverview();
    void vm.reloadThread();
  }, []);
  useRealtime((event) => void vm.onRealtime(event));

  const overviewReady = state.overview.status === 'success' || state.overview.status === 'refreshing';
  const { recipients, conversations } =
    state.overview.status === 'success' || state.overview.status === 'refreshing' ? state.overview.data : EMPTY;

  // Seed presence for everyone in the sidebar (the socket runs only online).
  const allUserIds = useMemo(() => recipients.map((r) => r.userId), [recipients]);
  useEffect(() => {
    if (!online || allUserIds.length === 0) return;
    let cancelled = false;
    countyBridge
      .getOnlineUsers(allUserIds)
      .then((ids) => {
        if (!cancelled) vm.setOnlineUsers(ids);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [online, allUserIds, vm]);

  // Deep links, once the overview is on screen.
  const searchParams = useSearchParams();
  const targetInstitutionId = searchParams.get('institutionId');
  const targetConversationId = searchParams.get('conv');
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !overviewReady) return;
    deepLinkedRef.current = true;
    if (targetInstitutionId) {
      // Opened from a parent profile's Send Message: select that school's admin.
      const recipient = recipients.find(
        (r) => r.role === 'INSTITUTION_ADMIN' && r.institutionId === targetInstitutionId,
      );
      if (!recipient) return;
      const conv = conversations.find((c) => c.counterpart.userId === recipient.userId);
      handleSelectItem(recipient, conv?.id ?? null);
      setRoleFilter('INSTITUTION_ADMIN');
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
    countyBridge
      .markConversationRead(selectedConversationId)
      .then(() => vm.loadOverview())
      .catch(() => undefined);
  }, [selectedConversationId, online, vm]);

  const districts = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of recipients) {
      if (r.districtId && r.districtName) map.set(r.districtId, r.districtName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [recipients]);

  // Past conversations with people no longer reachable stay listed (last).
  const sidebarItems = useMemo(() => buildSidebarItems(recipients, conversations), [recipients, conversations]);

  const filteredItems = useMemo(() => {
    return sidebarItems.filter(({ recipient }) => {
      if (roleFilter !== 'ALL' && recipient.role !== roleFilter) return false;
      if (districtFilter !== 'ALL' && recipient.districtId !== districtFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!`${recipient.firstName} ${recipient.lastName}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sidebarItems, roleFilter, districtFilter, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (districtRef.current && !districtRef.current.contains(e.target as Node)) setDistrictOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelectItem(recipient: CountyMessageRecipient, conversationId: string | null) {
    setMessageText('');
    setSendError(null);
    void vm.select(recipient, conversationId);
  }

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
        await countyBridge.sendDirectMessage({ conversationId, content });
        await Promise.all([vm.loadOverview(), vm.reloadThread()]);
      } else if (contact) {
        await countyBridge.startConversation({ targetUserId: contact.userId, initialMessage: content });
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

  const selectedDistrictLabel =
    districtFilter === 'ALL' ? 'All Districts' : (districts.find(([id]) => id === districtFilter)?.[1] ?? 'All Districts');

  const isSidebarLoading = state.overview.status === 'idle' || state.overview.status === 'loading';
  const messages =
    state.messages.status === 'success' || state.messages.status === 'refreshing' ? (state.messages.data ?? []) : [];

  return (
    <div className="flex h-[calc(100vh-140px)]  border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-200">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-gray-900">Messages</h2>
          {recipients.length > 0 && (
            <span className="ml-auto text-xs text-gray-400">
              {filteredItems.length} of {recipients.length}
            </span>
          )}
        </div>

        <div className="px-3 pt-2 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200  focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>
        </div>

        <div className="flex gap-1 px-3 py-1.5">
          {(['ALL', 'DEO', 'INSTITUTION_ADMIN'] as RoleFilter[]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`flex-1 py-1 text-xs font-medium transition-colors ${
                roleFilter === r ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        {districts.length > 0 && (
          <div className="px-3 pb-2 relative" ref={districtRef}>
            <button
              onClick={() => setDistrictOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <span className="truncate text-gray-700">{selectedDistrictLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${districtOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {districtOpen && (
              <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200  shadow-lg max-h-48 overflow-y-auto">
                <button
                  onClick={() => {
                    setDistrictFilter('ALL');
                    setDistrictOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 transition-colors ${districtFilter === 'ALL' ? 'text-primary font-semibold' : 'text-gray-700'}`}
                >
                  All Districts
                </button>
                {districts.map(([id, name]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setDistrictFilter(id);
                      setDistrictOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 transition-colors ${districtFilter === id ? 'text-primary font-semibold' : 'text-gray-700'}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
              <AlertTriangle className="w-5 h-5" />
              <p className="text-xs text-center">Failed to load messages.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2 px-4">
              <AlertTriangle className="w-5 h-5" />
              <p className="text-xs text-center">No people match your filters.</p>
            </div>
          ) : (
            filteredItems.map(({ recipient, conversation }) => {
              const isOnline = state.onlineUserIds.includes(recipient.userId);
              const isActive =
                conversation?.id === (selectedConversation?.id ?? null) ||
                (pendingContact?.userId === recipient.userId && !selectedConversation);

              if (conversation) {
                return (
                  <ConversationListItem
                    key={conversation.id}
                    conversation={conversation}
                    isSelected={isActive}
                    isOnline={isOnline}
                    onSelect={() => handleSelectItem(recipient, conversation.id)}
                  />
                );
              }

              return (
                <SidebarContactItem
                  key={recipient.userId}
                  recipient={recipient}
                  isSelected={isActive}
                  isOnline={isOnline}
                  onSelect={() => handleSelectItem(recipient, null)}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Message thread */}
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
