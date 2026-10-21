'use client';

import type { CountyMessageRecipient } from '@nemis-desktop/types';

interface Props {
  recipient: CountyMessageRecipient;
  isSelected: boolean;
  isOnline: boolean;
  onSelect: () => void;
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

/** Port of portal-web components/messaging/SidebarContactItem.tsx. */
export function SidebarContactItem({ recipient, isSelected, isOnline, onSelect }: Props) {
  const sub = [recipient.role.replace(/_/g, ' '), recipient.districtName ?? recipient.institutionName]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 border-b border-gray-100 last:border-0 ${
        isSelected ? 'bg-blue-50 border-l-2 border-l-accent' : ''
      }`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gray-300 text-white flex items-center justify-center text-sm font-semibold">
          {initials(recipient.firstName, recipient.lastName)}
        </div>
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {recipient.firstName} {recipient.lastName}
          </p>
          {isOnline && <span className="flex-shrink-0 text-xs text-green-600 font-medium">Active</span>}
        </div>
        <p className="text-xs text-gray-500 truncate">{sub}</p>
      </div>
    </button>
  );
}
