'use client';

import type { CountyDirectConversation } from '@nemis-desktop/types';
import { Avatar } from '@nemis-desktop/ui';

interface Props {
  conversation: CountyDirectConversation;
  isSelected: boolean;
  isOnline: boolean;
  onSelect: () => void;
}

function relativeTime(dateStr: string | null) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/** Port of portal-web components/messaging/ConversationListItem.tsx. */
export function ConversationListItem({ conversation, isSelected, isOnline, onSelect }: Props) {
  const { counterpart, lastMessage, unreadCount, lastMessageAt } = conversation;
  const fullName = `${counterpart.firstName} ${counterpart.lastName}`;

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 border-b border-gray-100 last:border-0 ${
        isSelected ? 'bg-blue-50 border-l-2 border-l-accent' : ''
      }`}
    >
      {/* Avatar with online indicator */}
      <div className="relative flex-shrink-0">
        <Avatar
          src={counterpart.photoUrl}
          firstName={counterpart.firstName}
          lastName={counterpart.lastName}
          role="generic"
          size="md"
        />
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
            {isOnline && <span className="flex-shrink-0 text-xs text-green-600 font-medium">Active</span>}
          </div>
          <span className="flex-shrink-0 text-xs text-gray-400">{relativeTime(lastMessageAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-gray-500 truncate">
            {counterpart.role.replace(/_/g, ' ')}
            {counterpart.institutionName ? ` · ${counterpart.institutionName}` : ''}
          </p>
          {unreadCount > 0 && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-accent text-white text-xs flex items-center justify-center px-1">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        {lastMessage && <p className="text-xs text-gray-400 truncate mt-0.5">{lastMessage}</p>}
      </div>
    </button>
  );
}
