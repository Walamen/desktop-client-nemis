'use client';

import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { MessageSquare, Send, Loader2, WifiOff } from 'lucide-react';
import type { CountyDirectMessage, CountyMessageRecipient } from '@nemis-desktop/types';
import { MessageBubble } from './MessageBubble';

export interface ThreadHeaderInfo {
  firstName: string;
  lastName: string;
  role: string;
  institutionName: string | null;
}

interface Props {
  headerInfo: ThreadHeaderInfo | null;
  isOnline: boolean;
  messages: CountyDirectMessage[];
  messageText: string;
  msgsLoading: boolean;
  msgsFetching: boolean;
  sending: boolean;
  pendingContact: CountyMessageRecipient | null;
  /** Sending needs the server; offline the thread stays readable. */
  canSend: boolean;
  sendError: string | null;
  onSend: () => void;
  onMessageChange: (text: string) => void;
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

/** Port of portal-web components/messaging/MessageThread.tsx, plus the
 * offline note: the composer is disabled while the device is offline. */
export function MessageThread({
  headerInfo,
  isOnline,
  messages,
  messageText,
  msgsLoading,
  msgsFetching,
  sending,
  pendingContact,
  canSend,
  sendError,
  onSend,
  onMessageChange,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  if (!headerInfo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
        <MessageSquare className="w-12 h-12" />
        <p className="text-base font-medium text-gray-500">Select someone to message</p>
        <p className="text-sm text-gray-400">Choose a person from the list on the left</p>
      </div>
    );
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <>
      {/* Thread header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-semibold">
            {initials(headerInfo.firstName, headerInfo.lastName)}
          </div>
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-gray-50" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {headerInfo.firstName} {headerInfo.lastName}
          </p>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-gray-500">
              {headerInfo.role.replace(/_/g, ' ')}
              {headerInfo.institutionName ? ` · ${headerInfo.institutionName}` : ''}
            </p>
            {isOnline ? (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Active now
              </span>
            ) : (
              <span className="text-xs text-gray-400">Offline</span>
            )}
          </div>
        </div>
        {msgsFetching && <Loader2 className="w-4 h-4 text-gray-400 animate-spin ml-auto" />}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50/30">
        {msgsLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <MessageSquare className="w-8 h-8" />
            <p className="text-sm">
              {pendingContact ? `Start your conversation with ${pendingContact.firstName}.` : 'No messages yet. Say hello!'}
            </p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white">
        <div className="flex items-end gap-3">
          <textarea
            value={messageText}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!canSend}
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            rows={2}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={onSend}
            aria-label="Send"
            disabled={!canSend || !messageText.trim() || sending}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {sendError && <p className="text-xs text-error mt-1.5">{sendError}</p>}
        {canSend ? (
          <p className="text-xs text-gray-400 mt-1.5">Press Enter to send · Shift+Enter for new line</p>
        ) : (
          <p className="flex items-center gap-1 text-xs text-gray-500 mt-1.5">
            <WifiOff className="w-3 h-3" />
            Messages need a connection to send.
          </p>
        )}
      </div>
    </>
  );
}
