'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  FileText,
  Info,
  Megaphone,
  MessageSquare,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { Spinner } from '@nemis-desktop/ui';
import {
  deoNotificationLink,
  matchesNotificationFilter,
  notificationCardType,
  notificationFilterOptions,
  type DeoCardType,
  type DeoNotificationFilter,
} from '@nemis-desktop/presentation';
import { useDeoNotificationsViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

const PAGE_SIZE = 50;

const STYLES: Record<DeoCardType, { card: string; iconWrap: string; dot: string; icon: LucideIcon }> = {
  ALERT: { card: 'bg-red-50 border-red-100', iconWrap: 'bg-red-100 text-red-600', dot: 'bg-red-600', icon: ShieldAlert },
  WARNING: { card: 'bg-amber-50 border-amber-100', iconWrap: 'bg-amber-100 text-amber-600', dot: 'bg-amber-500', icon: TriangleAlert },
  REPORT: { card: 'bg-indigo-50 border-indigo-100', iconWrap: 'bg-indigo-100 text-indigo-600', dot: 'bg-indigo-500', icon: FileText },
  MESSAGE: { card: 'bg-sky-50 border-sky-100', iconWrap: 'bg-sky-100 text-sky-600', dot: 'bg-sky-500', icon: MessageSquare },
  ANNOUNCEMENT: { card: 'bg-teal-50 border-teal-100', iconWrap: 'bg-teal-100 text-teal-600', dot: 'bg-teal-500', icon: Megaphone },
  SUCCESS: { card: 'bg-emerald-50 border-emerald-100', iconWrap: 'bg-emerald-100 text-emerald-600', dot: 'bg-emerald-500', icon: CheckCircle2 },
  INFO: { card: 'bg-gray-50 border-gray-100', iconWrap: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400', icon: Info },
};

function relativeTime(iso: string): string {
  const minutes = Math.round(Math.abs(Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function Banner() {
  return (
    <div className="bg-slate-900 text-white px-6 py-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
      <h1 className="text-xl font-bold text-white">Notifications</h1>
    </div>
  );
}

/** DEO Notifications: the signed-in DEO's own notifications, read from this
 * device; marking read is local and the outbox pushes it
 * (docs/superpowers/specs/2026-11-17-deo-messages-notifications-design.md). */
export function DeoNotificationsPage() {
  const vm = useDeoNotificationsViewModel();
  const state = useViewModel(vm.store, (s) => s.notifications);
  const [filter, setFilter] = useState<DeoNotificationFilter>('ALL');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [markingAll, setMarkingAll] = useState(false);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const items = useMemo(() => data?.items ?? [], [data]);
  const options = useMemo(
    () => notificationFilterOptions(items, { total: items.length, unread: data?.unread ?? 0 }),
    [items, data],
  );
  const filtered = useMemo(() => items.filter((item) => matchesNotificationFilter(item, filter)), [items, filter]);

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        <Banner />
        <div className="px-6 py-6">
          <div role="alert" className="bg-white border border-slate-300 rounded-2xl p-12 text-center">
            <AlertTriangle className="w-10 h-10 text-error mx-auto mb-3" aria-hidden />
            <p className="text-sm text-slate-700 font-medium">Unable to load notifications.</p>
            <button type="button" onClick={() => void vm.load()} className="mt-3 text-sm underline text-error">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        <Banner />
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  const place = [data.district?.name, data.county?.name].filter(Boolean).join(' · ');
  const markAll = async () => {
    setMarkingAll(true);
    try {
      await vm.markAllRead();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <Banner />
      <div className="px-6 py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Notifications</h2>
            <p className="text-sm text-gray-600">{place ? `DEO Portal · ${place}` : 'DEO Portal'}</p>
          </div>
          <button
            type="button"
            onClick={() => void markAll()}
            disabled={!data.unread || markingAll}
            className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden />
            Mark All as Read
          </button>
        </div>

        <div>
          <p className="text-3xl font-bold text-gray-900">{data.unread}</p>
          <p className="text-sm text-gray-500 mt-1">Unread notifications</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => {
                setFilter(option.value);
                setShown(PAGE_SIZE);
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                filter === option.value ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {option.label}
              <span className="ml-2 text-xs opacity-80">{option.count}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-300 rounded-2xl px-6 py-16 text-center">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
            <p className="text-gray-600 font-medium">
              {items.length === 0 ? 'No notifications yet.' : 'No notifications match this filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.slice(0, shown).map((item) => {
              const style = STYLES[notificationCardType(item.type)];
              const Icon = style.icon;
              const href = deoNotificationLink(item.link);
              return (
                <div key={item.id} data-notification className={`border rounded-2xl px-5 py-5 ${style.card}`}>
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${style.iconWrap}`}>
                        <Icon className="w-5 h-5" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                          {!item.isRead ? (
                            <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} aria-label="Unread" />
                          ) : null}
                        </div>
                        <p className="text-sm text-gray-600 mt-2 leading-6">{item.message}</p>
                        <p className="mt-3 text-xs text-gray-500">{relativeTime(item.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {!item.isRead ? (
                        <button
                          type="button"
                          onClick={() => void vm.markRead(item.id)}
                          className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50"
                        >
                          Mark as Read
                        </button>
                      ) : null}
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => {
                            if (!item.isRead) void vm.markRead(item.id);
                          }}
                          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90"
                        >
                          Open
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filtered.length > shown ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShown((count) => count + PAGE_SIZE)}
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50"
            >
              Load more
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
