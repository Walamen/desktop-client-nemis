'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import { SystemRole, type DesktopPortalRole } from '@nemis-desktop/types';
import { headerConfigs, sidebarConfigs, type SidebarBadge } from './sidebarConfig';
import { resolveActiveHref } from './active-nav';
import { useCollapsedGroups } from './use-collapsed-groups';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { usePendingTransferCount } from '@/lib/use-pending-transfer-count';

const groupListId = (label: string) => `sidebar-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

function CountPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Sidebar({
  role,
}: {
  role: DesktopPortalRole;
}) {
  const config = sidebarConfigs[role];
  const pathname = usePathname();
  const router = useRouter();
  const activeHref = resolveActiveHref(pathname ?? '', config, headerConfigs[role].basePath);
  const isActive = (href: string) => href === activeHref;
  const collapsible = config.collapsibleGroups === true;
  const { collapsed, toggle } = useCollapsedGroups(role, collapsible);

  // Hooks may not be called conditionally, so every role calls this; only the
  // school admin enables it, so other roles make no transfer reads.
  const pendingTransfers = usePendingTransferCount(role === SystemRole.INSTITUTION_ADMIN);
  const getBadgeCount = (badge?: SidebarBadge) => {
    if (badge === 'transfers') return pendingTransfers;
    return 0;
  };


  const handleLogout = () => {
    void sharedBridge.logout().finally(() => router.replace('/'));
  };

  return (
    <div className="w-[230px] bg-primary h-full flex flex-col" aria-label="Primary">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center">
          <img src="/logo.png" alt="NEMIS" className="h-11 w-11 object-contain" />
          </div>
          <div className="w-[80%]">
            <h2 className="font-heading font-bold text-md text-white truncate">Dashboard</h2>
        
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 sidebar-scroll" aria-label="Sidebar">
        <div className="space-y-1">
          {config.dashboardItem && (
            <Link
              href={config.dashboardItem.href}
              aria-current={isActive(config.dashboardItem.href) ? 'page' : undefined}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                isActive(config.dashboardItem.href)
                  ? 'bg-slate-800 text-neutral-light'
                  : 'text-white/80 hover:bg-slate-900 hover:text-neutral-light'
              }`}
            >
              <config.dashboardItem.icon className="w-5 h-5" />
              <span className="font-semibold text-sm">{config.dashboardItem.name}</span>
            </Link>
          )}

          {config.navGroups.map((group) => {
            const holdsActive = group.items.some((item) => isActive(item.href));
            const open = !collapsible || holdsActive || !collapsed.has(group.label);
            const listId = groupListId(group.label);
            const groupBadgeTotal = group.items.reduce((sum, item) => sum + getBadgeCount(item.badge), 0);
            return (
              <div key={group.label}>
                <div className="border-t border-white/20 my-3" />
                {collapsible ? (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={listId}
                    onClick={() => toggle(group.label)}
                    className="w-full flex items-center gap-2 px-4 mb-2 text-white/60 hover:text-white text-xs font-semibold tracking-wider"
                  >
                    {open ? <ChevronDown className="w-3.5 h-3.5" aria-hidden /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden />}
                    <span className="flex-1 text-left">{group.label}</span>
                    {!open && <CountPill count={groupBadgeTotal} />}
                  </button>
                ) : (
                  <div className="px-4 mb-2">
                    <span className="text-white/60 text-xs font-semibold tracking-wider">{group.label}</span>
                  </div>
                )}
                <div id={listId} hidden={!open} className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                          active ? 'bg-slate-800 text-slate-100' : 'text-white/80 hover:bg-slate-900 hover:text-white'
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className="font-semibold text-sm flex-1">{item.name}</span>
                        <CountPill count={getBadgeCount(item.badge)} />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
