'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@nemis-desktop/ui';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { academicYearCloseBridge } from '@/services/nemis-bridge/school-admin/academic-year-close-bridge';
import { OFFLINE_MESSAGE, PENDING_CHANGES_MESSAGE, confirmCloseCopy } from './close-copy';

/** Step 3: confirm. The close is blocked while this device still holds
 * changes the server has not accepted, and while offline. */
export function ConfirmCloseStep({
  yearId,
  code,
  onClosed,
  onRefused,
}: {
  yearId: string;
  code: string;
  onClosed: (refreshed: boolean) => void;
  /** The server refused: show its message and reload readiness. */
  onRefused: (message: string) => void;
}) {
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      setPending(await academicYearCloseBridge.getClosePendingChangesCount());
    } catch {
      setPending(null);
    }
  }, []);

  useEffect(() => { void loadPending(); }, [loadPending]);

  const close = async () => {
    setBusy(true);
    setError(null);
    // Re-check right now: changes may have appeared since the screen opened.
    try {
      const fresh = await academicYearCloseBridge.getClosePendingChangesCount();
      setPending(fresh);
      if (fresh > 0) {
        setBusy(false);
        return;
      }
    } catch {
      setPending(null);
      setBusy(false);
      return;
    }
    try {
      const result = await academicYearCloseBridge.closeYear(yearId);
      onClosed(result.refreshed !== false);
    } catch (cause) {
      const parsed = parseIpcError(cause);
      if (parsed?.code === 'REMOTE_REJECTED') {
        onRefused(parsed.message || 'The server did not close the year.');
        return;
      }
      setError(parsed?.message || 'The year could not be closed. Please try again.');
      setBusy(false);
    }
  };

  const blockedByPending = pending === null || pending > 0;
  return (
    <section className="space-y-4" aria-label="Confirm">
      <p className="text-sm text-slate-800">{confirmCloseCopy(code)}</p>
      {pending !== null && pending > 0 && (
        <p role="alert" className="rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {PENDING_CHANGES_MESSAGE}
        </p>
      )}
      {pending === null && (
        <p role="alert" className="text-sm text-red-700">Could not check this device&apos;s unsynced changes. Try again.</p>
      )}
      {!online && <p className="text-sm text-slate-500">{OFFLINE_MESSAGE}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void loadPending()}>{pending === null ? 'Try again' : 'Check again'}</Button>
        <Button variant="destructive" disabled={busy || !online || blockedByPending} onClick={() => void close()}>
          {`Close ${code}`}
        </Button>
      </div>
    </section>
  );
}
