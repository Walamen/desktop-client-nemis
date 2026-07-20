'use client';

import { X } from 'lucide-react';
import { useNotificationStore } from '../../lib/presentation/hooks';
import { useViewModel } from '../../hooks/use-view-model';

const KIND_STYLES: Record<string, string> = {
  success: 'border-l-active',
  info: 'border-l-secondary',
  warning: 'border-l-pending',
  error: 'border-l-error',
};

export function ToastHost() {
  const store = useNotificationStore();
  const notifications = useViewModel(store.store, (s) => s.notifications);

  if (notifications.length === 0) return null;
  return (
    <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 w-80" aria-live="polite">
      {notifications.map((n) => (
        <div key={n.id} className={`bg-white border border-slate-200 border-l-4 ${KIND_STYLES[n.kind] ?? 'border-l-slate-400'} rounded-md shadow-sm p-3 flex items-start gap-2`}>
          <p className="text-sm text-slate-800 flex-1">{n.message}</p>
          <button type="button" aria-label="Dismiss" onClick={() => store.dismiss(n.id)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
