'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Search, ChevronDown, Bell, LogOut, User2, Settings } from 'lucide-react';
import { Avatar, Breadcrumbs, Dropdown, DropdownItem } from '@nemis-desktop/ui';
import { useCurrentUserViewModel, useNotificationStore } from '../../lib/presentation/hooks';
import { useViewModel } from '../../hooks/use-view-model';
import type { DesktopPortalRole } from '@nemis-desktop/types';
import { resolvePageTitle } from './page-titles';
import { headerConfigs } from './sidebarConfig';
import { nemisBridge } from '@/services/nemis-bridge';
import { useRouter } from 'next/navigation';

export function Header({ role }: { role: DesktopPortalRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const { title, segments } = resolvePageTitle(pathname, role);
  const [menuOpen, setMenuOpen] = useState(false);

  const currentUser = useCurrentUserViewModel();
  const userState = useViewModel(currentUser.store, (s) => s.user);
  const fullName = userState.status === 'success' ? userState.data.fullName : 'User';
  const roleLabel = userState.status === 'success' ? (userState.data.roleLabels[0] ?? '—') : '—';

  const notifications = useNotificationStore();
  const unread = useViewModel(notifications.store, (s) => s.notifications.length);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-2 lg:px-6 py-2">
      <div className="flex items-center justify-between h-full w-full gap-8">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-primary-500 truncate">{title}</h2>
          <Breadcrumbs segments={segments} />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden md:block w-70 border-r border-gray-200">
            <input
              type="text"
              placeholder="Quick Search..."
              aria-label="Quick search (coming soon)"
              disabled
              className="peer w-full bg-gray-50 pl-11 pr-4 py-2 border-b border-gray-300 focus:outline-none disabled:cursor-not-allowed"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          <button
            type="button"
            className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={`${unread} unread notifications`}
          >
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          <Dropdown
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <>
                {/* avatarRole picks the per-role fallback image, but it's only reached when there's
                    no src AND no computable initials; since fullName always yields initials here,
                    this plumbing is correct but currently dormant — the initials branch always wins. */}
                <Avatar firstName={fullName.split(' ')[0]} lastName={fullName.split(' ')[1]} role={headerConfigs[role].avatarRole} size="md" className="border border-gray-200" alt={fullName} />
                <div className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-sm font-semibold text-gray-900">{fullName}</span>
                  <span className="text-sm font-semibold text-gray-600">{roleLabel}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </>
            }
          >
            <DropdownItem icon={<User2 className="w-4 h-4 text-gray-600" />} onSelect={() => setMenuOpen(false)} disabled>
              Profile (coming soon)
            </DropdownItem>
            <DropdownItem icon={<Settings className="w-4 h-4 text-gray-600" />} onSelect={() => setMenuOpen(false)} disabled>
              Settings (coming soon)
            </DropdownItem>
            <div className="h-px bg-gray-200" />
            <DropdownItem icon={<LogOut className="w-4 h-4 text-gray-600" />} onSelect={() => {
              setMenuOpen(false);
              void nemisBridge.logout().finally(() => router.replace('/'));
            }}>
              Sign Out
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
