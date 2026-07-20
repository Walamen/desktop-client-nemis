'use client';

import { Wifi, WifiOff, Database, RefreshCw } from 'lucide-react';
import {
  selectConnectivityPresentation,
  selectSyncPresentation,
} from '@nemis-desktop/presentation';
import { useConnectivityStore } from '../../lib/presentation/hooks';
import { useViewModel } from '../../hooks/use-view-model';
import { useAppVersion } from '../../hooks/useAppVersion';

export function StatusBar() {
  const connectivity = useConnectivityStore();
  const isOnline = useViewModel(connectivity.store, (s) => s.isOnline);
  const connLabel = useViewModel(connectivity.store, (s) => selectConnectivityPresentation(s).label);
  const syncLabel = useViewModel(connectivity.store, (s) => selectSyncPresentation(s).label);
  const { version } = useAppVersion();

  return (
    <footer
      className="flex items-center justify-between h-7 px-4 bg-slate-100 border-t border-slate-200 text-[11px] text-slate-600"
      role="status"
      aria-label="Application status"
    >
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          {isOnline ? <Wifi className="w-3.5 h-3.5 text-active" /> : <WifiOff className="w-3.5 h-3.5 text-error" />}
          {connLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          {syncLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-active" />
          Local database ready
        </span>
        <span>0 pending changes</span>
      </div>
      <span>NEMIS Desktop v{version ?? '—'}</span>
    </footer>
  );
}
