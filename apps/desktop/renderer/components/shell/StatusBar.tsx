'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  CloudUpload,
  AlertTriangle,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import type { DesktopSyncStatus } from '@nemis-desktop/types';
import {
  selectConnectivityPresentation,
  selectSyncPresentation,
} from '@nemis-desktop/presentation';
import { useConnectivityStore } from '../../lib/presentation/hooks/shared';
import { useViewModel } from '../../hooks/use-view-model';
import { useAppVersion } from '../../hooks/useAppVersion';
import { nemisBridge } from '@/services/nemis-bridge';

export function StatusBar() {
  const connectivity = useConnectivityStore();
  const isOnline = useViewModel(connectivity.store, (s) => s.isOnline);
  const connLabel = useViewModel(connectivity.store, (s) => selectConnectivityPresentation(s).label);
  const syncLabel = useViewModel(connectivity.store, (s) => selectSyncPresentation(s).label);
  const { version } = useAppVersion();
  const pathname = usePathname();
  const [localSync, setLocalSync] = useState<DesktopSyncStatus | null>(null);
  // Also the trigger for useRevalidateOnSync: writing a new lastSyncAt into
  // the shared ConnectivityStore is how every other screen in the app finds
  // out a background/manual sync just landed fresh data, since the
  // presentation layer's ViewModels are otherwise built once per session
  // (see app/providers.tsx) and never refetch on their own.
  const applyStatus = useCallback((status: DesktopSyncStatus) => {
    setLocalSync(status);
    connectivity.setOnline(status.isOnline);
    if (status.lastSyncAt && status.lastSyncAt !== connectivity.store.getState().lastSyncAt) {
      connectivity.markSyncCompleted(status.lastSyncAt);
    } else {
      connectivity.setSyncStatus(status.status === 'syncing' || status.status === 'failed' ? status.status : 'idle');
    }
  }, [connectivity]);
  const refresh = useCallback(() => {
    try {
      void nemisBridge.getSyncStatus().then(applyStatus).catch(() => setLocalSync(null));
    } catch {
      setLocalSync(null);
    }
  }, [applyStatus]);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const portalBase = (pathname ?? '/government/school-admin').split('/').slice(0, 3).join('/');
  const pending = localSync?.pending ?? 0;
  const conflicts = localSync?.conflicts ?? 0;

  return (
    <footer
      className="flex items-center justify-between h-7 px-4 py-8 bg-slate-100 border-t border-slate-200 text-[11px] text-slate-600"
      role="status"
      aria-label="Application status"
    >
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          {isOnline ? <Wifi className="w-3.5 h-3.5 text-active" /> : <WifiOff className="w-3.5 h-3.5 text-error" />}
          {connLabel}
        </span>
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-blue-700"
          onClick={() => void nemisBridge.runSync().then(applyStatus).catch(refresh)}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {localSync?.status === 'syncing' ? 'Syncing' : syncLabel}
        </button>
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-active" />
          Local database ready
        </span>
        <StatusBarLink
          href={`${portalBase}/sync-pending`}
          icon={CloudUpload}
          count={pending}
          label="pending"
          ariaLabel={pendingLabel(pending)}
          tone="pending"
        />
        <StatusBarLink
          href={`${portalBase}/sync-conflicts`}
          icon={AlertTriangle}
          count={conflicts}
          label={conflictWord(conflicts)}
          ariaLabel={`${formatCount(conflicts)} ${conflictWord(conflicts)}`}
          tone="error"
        />
      </div>
      <span>NEMIS Desktop v{version ?? '—'}</span>
    </footer>
  );
}

type StatusBarTone = 'pending' | 'error';

const BADGE_TONE: Record<StatusBarTone, string> = {
  pending: 'bg-pending/20 text-slate-900',
  error: 'bg-error text-white',
};
const ICON_TONE: Record<StatusBarTone, string> = {
  pending: 'text-pending',
  error: 'text-error',
};

/** A status-bar count that opens a page. The icon, badge and chevron make it
 * read as clickable at rest, not only on hover; the full phrase stays the
 * accessible name. */
function StatusBarLink({
  href,
  icon: Icon,
  count,
  label,
  ariaLabel,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  count: number;
  label: string;
  ariaLabel: string;
  tone: StatusBarTone;
}) {
  const active = count > 0;
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex items-center gap-1.5 -mx-2 rounded-button px-2 py-0.5 hover:bg-slate-200 hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
    >
      <Icon aria-hidden="true" className={`w-3.5 h-3.5 ${active ? ICON_TONE[tone] : ''}`} />
      <span
        data-tone={active ? tone : 'none'}
        className={`inline-flex min-w-[1.25rem] justify-center rounded-button px-1.5 text-[10px] font-semibold leading-4 ${
          active ? BADGE_TONE[tone] : 'bg-white text-slate-700'
        }`}
      >
        {formatCount(count)}
      </span>
      {label}
      <ChevronRight aria-hidden="true" className="w-3 h-3" />
    </Link>
  );
}

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

function pendingLabel(count: number): string {
  return `${formatCount(count)} pending change${count === 1 ? '' : 's'}`;
}

function conflictWord(count: number): string {
  return count === 1 ? 'conflict' : 'conflicts';
}
