'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Search, ChevronDown, LogOut, User2, Settings } from 'lucide-react';
import { Avatar, Breadcrumbs, Dropdown, DropdownItem, Input } from '@nemis-desktop/ui';
import { useCurrentUserViewModel } from '../../lib/presentation/hooks/shared';
import { useViewModel } from '../../hooks/use-view-model';
import type { DesktopPortalRole } from '@nemis-desktop/types';
import { resolvePageTitle } from './page-titles';
import { headerConfigs } from './sidebarConfig';
import { NotificationBell } from './NotificationBell';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { useRouter } from 'next/navigation';

export function Header({ role }: { role: DesktopPortalRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const { title, segments } = resolvePageTitle(pathname, role);
  const [menuOpen, setMenuOpen] = useState(false);

  const currentUser = useCurrentUserViewModel();
  const userState = useViewModel(currentUser.store, (s) => s.user);
  const user = userState.status === 'success' || userState.status === 'refreshing' ? userState.data : null;
  const fullName = user?.fullName ?? 'User';
  const roleLabel = user ? (user.roleLabels[0] ?? '—') : '—';
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    void sharedBridge
      .logout()
      .catch((err: unknown) => console.error('Sign out failed', err))
      .finally(() => router.replace('/'));
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-2 lg:px-6 py-2">
      <div className="flex items-center justify-between h-full w-full gap-8">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-primary-500 truncate">{title}</h2>
          <Breadcrumbs segments={segments} />
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:block w-70">
            <Input
              type="text"
              placeholder="Quick Search..."
              aria-label="Quick search (coming soon)"
              disabled
              icon={<Search className="w-4 h-4 text-gray-400" />}
            />
          </div>

          {headerConfigs[role].showNotificationBell && <NotificationBell basePath={headerConfigs[role].basePath} />}

          <Dropdown
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <>
                {/* avatarRole picks the per-role fallback image. Avatar uses it only when there is no photo and
                    no initials: i.e. before the user has loaded (first/last undefined). A photo that fails to
                    load falls back to initials. */}
                <Avatar src={user?.photoUrl ?? undefined} firstName={user?.firstName} lastName={user?.lastName} role={headerConfigs[role].avatarRole} size="md" className="border border-gray-200" alt={fullName} />
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
            <DropdownItem icon={<LogOut className="w-4 h-4 text-gray-600" />} onSelect={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
