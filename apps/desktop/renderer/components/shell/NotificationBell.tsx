'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Dropdown } from '@nemis-desktop/ui';
import { useHeaderNotificationsViewModel } from '../../lib/presentation/hooks/shared';
import { useViewModel } from '../../hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useRealtime } from '@/hooks/use-realtime';
import { getNotificationMeta, relativeTime } from '@/components/notifications/shared';
import { toPortalRoute } from './notification-links';

export function NotificationBell({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const vm = useHeaderNotificationsViewModel();
  const { unread, recent } = useViewModel(vm.store, (s) => s);
  const [open, setOpen] = useState(false);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [pathname]);
  useRealtime((event) => {
    if (event.type === 'notification') void vm.load();
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void vm.load();
  };
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const allHref = `${basePath}/notifications`;

  return (
    <Dropdown
      open={open}
      onOpenChange={handleOpenChange}
      triggerLabel={`${unread} unread notifications`}
      panelClassName="w-80"
      trigger={
        <span className="relative text-gray-600">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </span>
      }
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-900">Notifications</span>
        {unread > 0 && (
          <span className="text-xs font-semibold text-primary-600 bg-primary-50 rounded-full px-2 py-0.5">{unread} new</span>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500 text-center">No notifications</p>
        ) : (
          recent.map((n) => {
            const meta = getNotificationMeta(n.type);
            return (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                onClick={() => go(toPortalRoute(n.link, basePath) ?? allHref)}
                className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">{n.title}</span>
                  <span className={`shrink-0 text-[10px] font-semibold rounded px-1.5 py-0.5 ${meta.bgColor} ${meta.color}`}>{meta.label}</span>
                </div>
                <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{n.message}</p>
                <p className="text-[11px] text-gray-400 mt-1">{relativeTime(n.createdAt)}</p>
              </button>
            );
          })
        )}
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={() => go(allHref)}
        className="w-full px-4 py-3 text-sm font-medium text-primary-600 hover:bg-gray-50 text-center"
      >
        View all notifications
      </button>
    </Dropdown>
  );
}
