'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Filter } from 'lucide-react';
import { Spinner } from '@nemis-desktop/ui';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';
import { nemisBridge } from '@/services/nemis-bridge';
import type { SchoolSummaryResult } from '@nemis-desktop/types';
import { getNotificationMeta, listMyNotifications, markNotificationRead, relativeTime, type NotificationRow } from './shared';

type FilterRead = 'ALL' | 'UNREAD' | 'READ';

export function NotificationsPage() {
  const currentUser = useCurrentUserViewModel();
  const userState = useViewModel(currentUser.store, (s) => s.user);
  const userId = userState.status === 'success' ? userState.data.id : null;

  const [school, setSchool] = useState<SchoolSummaryResult | null>(null);
  const [filterRead, setFilterRead] = useState<FilterRead>('ALL');
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    currentUser.loadCurrentUser();
    nemisBridge.getSchoolSummary().then(setSchool).catch(() => setSchool(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const rows = await listMyNotifications(userId);
    setNotifications(rows);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const isLoading = userId !== null && notifications === null;
  const all = notifications ?? [];
  const unreadCount = all.filter((n) => !n.isRead).length;
  const visible = filterRead === 'ALL' ? all : filterRead === 'UNREAD' ? all.filter((n) => !n.isRead) : all.filter((n) => n.isRead);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    await load();
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await Promise.all(all.filter((n) => !n.isRead).map((n) => markNotificationRead(n.id)));
      await load();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-slate-900 px-6 py-5 text-white">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">School Admin Portal</p>
          <h1 className="mt-0.5 text-xl font-bold">Notifications</h1>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-medium text-white">{unreadCount} unread</span>
          )}
          <button onClick={handleMarkAllRead} disabled={markingAll || unreadCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50">
            <Check className="h-3 w-3" />
            Mark all read
          </button>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-300">{school?.name || 'School'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter</span>
          </div>
          <div className="flex gap-2">
            {(['ALL', 'UNREAD', 'READ'] as const).map((f) => (
              <button key={f} onClick={() => setFilterRead(f)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${filterRead === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {f === 'ALL' ? 'All' : f === 'UNREAD' ? 'Unread' : 'Read'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          ) : visible.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="mx-auto mb-3 h-12 w-12 text-gray-400" />
              <p className="text-sm text-gray-500">No notifications yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visible.map((n) => {
                const meta = getNotificationMeta(n.type);
                return (
                  <div key={n.id} className={`flex items-start gap-4 p-4 transition-colors ${n.isRead ? 'bg-white' : 'border-l-4 border-sky-600 bg-sky-50'}`}>
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                      <Bell className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className={`text-sm text-gray-900 ${n.isRead ? 'font-medium' : 'font-semibold'}`}>{n.title}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${meta.bgColor} ${meta.color}`}>{meta.label}</span>
                        {!n.isRead && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-sky-600" />}
                      </div>
                      <p className="mb-1 text-sm text-gray-600">{n.message}</p>
                      {n.link && (
                        <a href={n.link} className="text-xs text-sky-700 hover:underline">View details →</a>
                      )}
                      <p className="mt-1 text-xs text-gray-400">{relativeTime(n.createdAt)}</p>
                    </div>
                    {!n.isRead && (
                      <button onClick={() => handleMarkRead(n.id)}
                        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                        <Check className="h-3 w-3" />
                        Read
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
