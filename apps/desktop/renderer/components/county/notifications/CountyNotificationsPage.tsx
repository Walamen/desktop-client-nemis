'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, Button, Spinner, EmptyState } from '@nemis-desktop/ui';
import type { CountyNotificationsFilter } from '@nemis-desktop/types';
import { Check, AlertTriangle, Info } from 'lucide-react';
import { useCountyNotificationsViewModel } from '@/lib/presentation/hooks/county';
import { useHeaderNotificationsViewModel } from '@/lib/presentation/hooks/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useRealtime } from '@/hooks/use-realtime';
import { toDesktopRoute } from './links';

const TYPE_SEVERITY: Partial<Record<string, 'info' | 'warning' | 'error'>> = {
  SCHOOL_APPROVAL_REQUESTED: 'warning',
  SCHOOL_REJECTED: 'error',
  BULK_UPLOAD_FAILED: 'error',
  SYSTEM_ANNOUNCEMENT: 'info',
};

function getSeverityClasses(type: string) {
  const sev = TYPE_SEVERITY[type] ?? 'info';
  if (sev === 'error') return { icon: 'bg-error/10 text-error', border: 'border-l-error' };
  if (sev === 'warning') return { icon: 'bg-warning/10 text-warning', border: 'border-l-warning' };
  return { icon: 'bg-primary/10 text-primary', border: 'border-l-primary' };
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Port of portal-web government/county/notifications/page.tsx, read from this
 * device. Unread counts notifications only, Total counts all of them, and
 * the list pages 20 at a time. */
export function CountyNotificationsPage() {
  const [filter, setFilter] = useState<CountyNotificationsFilter>('ALL');
  const [markingAll, setMarkingAll] = useState(false);
  const vm = useCountyNotificationsViewModel();
  const headerNotifications = useHeaderNotificationsViewModel();
  const state = useViewModel(vm.store, (s) => s);

  useRevalidateOnSync(() => {
    void vm.load(filter);
  }, [filter]);
  useRealtime((event) => {
    if (event.type === 'notification') void vm.load(filter);
  });

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await vm.markAllRead();
    } catch (error) {
      console.error('Failed to mark all notifications read', error);
      void vm.load(filter); // resync the list; a success already updated it locally
    } finally {
      void headerNotifications.load();
      setMarkingAll(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await vm.markRead(id);
    } catch (error) {
      console.error('Failed to mark notification read', error);
      void vm.load(filter);
    } finally {
      void headerNotifications.load();
    }
  };

  const notifications = state.items;
  const isLoading = state.status === 'idle' || state.status === 'loading';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900 text-white px-6 py-5">
        <div>
          <h1 className="text-xl font-bold text-white">Notifications & Messages</h1>
          <p className="text-body text-slate-300">Stay updated with alerts, approvals, and communications</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => void handleMarkAllRead()}
            disabled={state.unread === 0}
            loading={markingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Check className="w-3 h-3 mr-1" />
            Mark all read
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Unread</p>
            <p className="text-3xl font-bold text-error">{state.unread}</p>
            <p className="text-xs text-gray-500 mt-1">Notifications</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">System Alerts</p>
            <p className="text-3xl font-bold text-warning">{state.alertsUnresolved}</p>
            <p className="text-xs text-gray-500 mt-1">Unresolved</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Total</p>
            <p className="text-3xl font-bold text-primary">{state.totalAll}</p>
            <p className="text-xs text-gray-500 mt-1">All notifications</p>
          </div>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            {(['ALL', 'UNREAD', 'READ'] as CountyNotificationsFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2  font-medium text-sm transition-all ${
                  filter === f ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f === 'ALL' ? 'All' : f === 'UNREAD' ? 'Unread' : 'Read'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Notifications List */}
      <div className="space-y-3">
        {isLoading ? (
          <Card>
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          </Card>
        ) : state.status === 'error' ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
              <AlertTriangle className="w-8 h-8" />
              <p className="text-sm">Failed to load notifications.</p>
            </div>
          </Card>
        ) : notifications.length === 0 ? (
          <Card>
            <EmptyState title="No notifications" description="You're all caught up!" />
          </Card>
        ) : (
          notifications.map((n) => {
            const cls = getSeverityClasses(n.type);
            const href = toDesktopRoute(n.link);
            return (
              <Card key={n.id} className={`transition-all hover:shadow-md ${!n.isRead ? `border-l-4 ${cls.border}` : ''}`}>
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg flex-shrink-0 ${cls.icon}`}>
                    {TYPE_SEVERITY[n.type] === 'error' ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-neutral-dark">{n.title}</h3>
                          {!n.isRead && <span className="w-2 h-2 bg-primary rounded-full" />}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{n.message}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{relativeTime(n.createdAt)}</span>
                          <span>·</span>
                          <span>{n.type.replace(/_/g, ' ')}</span>
                        </div>
                        {href && (
                          <Link href={href} className="text-xs text-accent hover:underline mt-1 inline-block">
                            View details →
                          </Link>
                        )}
                      </div>
                      {!n.isRead && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleMarkRead(n.id)}
                          className="flex-shrink-0"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Read
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
        {state.hasMore && state.status === 'ready' && (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" loading={state.loadingMore} onClick={() => void vm.loadMore()}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
