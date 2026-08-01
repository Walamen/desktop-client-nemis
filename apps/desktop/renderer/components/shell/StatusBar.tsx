'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wifi, WifiOff, Database, RefreshCw } from 'lucide-react';
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
  const refresh = useCallback(() => {
    try {
      void nemisBridge
        .getSyncStatus()
        .then((status) => {
          setLocalSync(status);
          connectivity.setOnline(status.isOnline);
        })
        .catch(() => setLocalSync(null));
    } catch {
      setLocalSync(null);
    }
  }, [connectivity]);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const portalBase = (pathname ?? '/government/school-admin').split('/').slice(0, 3).join('/');

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
          onClick={() => void nemisBridge.runSync().then(setLocalSync).catch(refresh)}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {localSync?.status === 'syncing' ? 'Syncing' : syncLabel}
        </button>
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-active" />
          Local database ready
        </span>
        <span>{localSync?.pending ?? 0} pending changes</span>
        <Link className={localSync?.conflicts ? 'font-semibold text-red-700' : ''} href={`${portalBase}/sync-conflicts`}>
          {localSync?.conflicts ?? 0} conflicts
        </Link>
      </div>
      <span>NEMIS Desktop v{version ?? '—'}</span>
    </footer>
  );
}
