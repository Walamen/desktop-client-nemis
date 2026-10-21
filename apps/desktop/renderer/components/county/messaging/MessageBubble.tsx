'use client';

import type { CountyDirectMessage } from '@nemis-desktop/types';

/** Port of portal-web components/messaging/MessageBubble.tsx. */
export function MessageBubble({ message }: { message: CountyDirectMessage }) {
  const { isOwn, content, senderName, createdAt } = message;
  const time = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} mb-3`}>
      {!isOwn && <span className="text-xs text-gray-500 mb-1 ml-1">{senderName}</span>}
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
          isOwn ? 'bg-primary text-white rounded-tr-sm' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-sm'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
      </div>
      <span className={`text-xs text-gray-400 mt-1 ${isOwn ? 'mr-1' : 'ml-1'}`}>{time}</span>
    </div>
  );
}
