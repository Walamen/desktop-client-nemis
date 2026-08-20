'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useNotificationStore } from '../../lib/presentation/hooks/shared';
import { useViewModel } from '../../hooks/use-view-model';

const KIND_STYLES: Record<string, string> = {
  success: 'border-l-active',
  info: 'border-l-secondary',
  warning: 'border-l-pending',
  error: 'border-l-error',
};

const AUTO_DISMISS_MS = 6000;
const EXIT_ANIMATION_MS = 400;

export function ToastHost() {
  const store = useNotificationStore();
  const notifications = useViewModel(store.store, (s) => s.notifications);
  const autoDismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const exitTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());

  // Plays the slide-out animation, then removes the notification from the store once it finishes.
  const requestDismiss = (id: string) => {
    if (exitTimersRef.current.has(id)) return; // already closing

    const autoTimer = autoDismissTimersRef.current.get(id);
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoDismissTimersRef.current.delete(id);
    }

    setClosingIds((prev) => new Set(prev).add(id));

    const exitTimer = setTimeout(() => {
      exitTimersRef.current.delete(id);
      store.dismiss(id);
      setClosingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, EXIT_ANIMATION_MS);
    exitTimersRef.current.set(id, exitTimer);
  };

  useEffect(() => {
    const autoTimers = autoDismissTimersRef.current;
    const activeIds = new Set(notifications.map((n) => n.id));

    // Schedule auto-dismiss for any notification that doesn't have a timer yet.
    for (const n of notifications) {
      if (!autoTimers.has(n.id) && !exitTimersRef.current.has(n.id)) {
        const timer = setTimeout(() => {
          autoTimers.delete(n.id);
          requestDismiss(n.id);
        }, AUTO_DISMISS_MS);
        autoTimers.set(n.id, timer);
      }
    }

    // Clear timers for notifications that are gone (dismissed or otherwise removed).
    for (const [id, timer] of autoTimers) {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        autoTimers.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, store]);

  useEffect(() => {
    const autoTimers = autoDismissTimersRef.current;
    const exitTimers = exitTimersRef.current;
    return () => {
      for (const timer of autoTimers.values()) clearTimeout(timer);
      for (const timer of exitTimers.values()) clearTimeout(timer);
      autoTimers.clear();
      exitTimers.clear();
    };
  }, []);

  if (notifications.length === 0) return null;
  return (
    <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 w-80" aria-live="polite">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`bg-white border border-slate-200 border-l-4 ${KIND_STYLES[n.kind] ?? 'border-l-slate-400'} rounded-md shadow-sm p-3 flex items-start gap-2 ${closingIds.has(n.id) ? 'animate-toast-out' : 'animate-toast-in'}`}
        >
          <p className="text-sm text-slate-800 flex-1">{n.message}</p>
          <button type="button" aria-label="Dismiss" onClick={() => requestDismiss(n.id)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
