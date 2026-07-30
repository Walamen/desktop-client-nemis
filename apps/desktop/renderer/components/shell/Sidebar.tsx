'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Map, LogOut } from 'lucide-react';
import type { DesktopPortalRole } from '@nemis-desktop/types';
import { sidebarConfigs, type SidebarBadge } from './sidebarConfig';
import { useNotificationStore } from '../../lib/presentation/hooks/shared';
import { useViewModel } from '../../hooks/use-view-model';
import { sharedBridge } from '@/services/nemis-bridge/shared';

export function Sidebar({
  role,
  institutionName,
}: {
  role: DesktopPortalRole;
  institutionName?: string;
}) {
  const config = sidebarConfigs[role];
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => pathname === href;

  const notifications = useNotificationStore();
  const unreadNotifications = useViewModel(notifications.store, (s) => s.notifications.length);
  const getBadgeCount = (badge?: SidebarBadge) => (badge === 'notifications' ? unreadNotifications : 0);

  const headerTitle = config.headerTitle ?? institutionName ?? 'NEMIS';

  const handleLogout = () => {
    void sharedBridge.logout().finally(() => router.replace('/'));
  };

  return (
    <div className="w-[230px] bg-primary h-full flex flex-col" aria-label="Primary">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 flex items-center justify-center">
            <Map className="w-6 h-6 text-white" />
          </div>
          <div className="w-[80%]">
            <h2 className="font-heading font-bold text-md text-white truncate">{headerTitle}</h2>
            {config.headerSubtitle && <p className="text-xs text-white/50">{config.headerSubtitle}</p>}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 sidebar-scroll" aria-label="Sidebar">
        <div className="space-y-1">
          {config.dashboardItem && (
            <Link
              href={config.dashboardItem.href}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                isActive(config.dashboardItem.href)
                  ? 'bg-slate-800 text-neutral-light'
                  : 'text-white/80 hover:bg-slate-900 hover:text-neutral-light'
              }`}
            >
              <config.dashboardItem.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{config.dashboardItem.name}</span>
            </Link>
          )}

          {config.navGroups.map((group) => (
            <div key={group.label}>
              <div className="border-t border-white/20 my-4" />
              <div className="px-4 mb-2">
                <span className="text-white/40 text-xs font-semibold tracking-wider">{group.label}</span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  const badgeCount = getBadgeCount(item.badge);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        active ? 'bg-slate-800 text-slate-100' : 'text-white/80 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <span className="font-semibold text-sm flex-1">{item.name}</span>
                      {badgeCount > 0 && (
                        <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-error hover:text-white transition-colors w-full"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </div>
  );
}
