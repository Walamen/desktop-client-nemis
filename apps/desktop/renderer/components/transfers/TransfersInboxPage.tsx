'use client';
import { useEffect, useState } from 'react';
import { Button } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useSettingsViewModel } from '@/lib/presentation/hooks/school-admin';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import {
  countPendingDecisions,
  notifyTransfersChanged,
  splitByWhoAsked,
  toLocalTransfer,
  type LocalTransfer,
  type TransferAction,
} from '@/lib/transfers';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { NewTransferForm } from './NewTransferForm';
import { TransferRow } from './TransferRow';

type Tab = 'toUs' | 'ours' | 'history';

const SYNC_NOTE = 'Saved — this will appear once this device syncs.';
const OFFLINE_HINT = 'Connect to the internet to act on transfers.';
const EMPTY: Record<Tab, string> = {
  toUs: 'No transfer requests are waiting on this school.',
  ours: 'This school has no open transfer requests.',
  history: 'No decided transfers yet.',
};

const newestFirst = (key: (r: LocalTransfer) => string | null) => (a: LocalTransfer, b: LocalTransfer) =>
  (key(b) ?? '').localeCompare(key(a) ?? '');

/** The school's transfers inbox. Rows come from the local pull (readable
 * offline); every action is an online command followed by a local reload —
 * transfers are never written locally. */
export function TransfersInboxPage() {
  const settings = useSettingsViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);

  const [rows, setRows] = useState<LocalTransfer[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<Tab>('toUs');
  const [open, setOpen] = useState<{ id: string; action: TransferAction } | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void settings.loadCurrentSchool();
  }, [settings]);

  useRevalidateOnSync(() => {
    let cancelled = false;
    sharedBridge
      .listSchoolAdminRecords({ collection: 'student_transfers', limit: 250 })
      .then((result) => {
        if (cancelled) return;
        setRows(result.items.map(toLocalTransfer).filter((r): r is LocalTransfer => r !== null));
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const us = profile.status === 'success' || profile.status === 'refreshing' ? profile.data.id : '';
  const now = Date.now();

  // Lapse depends on the clock, so the split is recomputed on every render.
  const split = splitByWhoAsked(rows ?? [], us);
  const byCreated = newestFirst((r) => r.createdAt);
  const toUs = split.requestsToUs.filter((r) => r.status === 'PENDING').sort(byCreated);
  const ours = split.ourRequests.filter((r) => r.status === 'PENDING').sort(byCreated);
  const history = [...split.requestsToUs, ...split.ourRequests]
    .filter((r) => r.status !== 'PENDING')
    .sort(newestFirst((r) => r.reviewedAt ?? r.createdAt));
  const pendingCount = countPendingDecisions(split.requestsToUs, now);
  const oursIds = new Set(split.ourRequests.map((r) => r.id));

  const onDone = (refreshed: boolean) => {
    setOpen(null);
    setCreating(false);
    setNotice(refreshed ? null : SYNC_NOTE);
    setReloadKey((k) => k + 1);
    notifyTransfersChanged();
  };

  const visible = tab === 'toUs' ? toUs : tab === 'ours' ? ours : history;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'toUs', label: 'Requests to us', count: pendingCount },
    { key: 'ours', label: 'Our requests' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inter-school transfers</h1>
          <p className="text-sm text-slate-500">
            Transfer requests involving this school. Acting on a request needs a connection.
          </p>
        </div>
        <Button type="button" disabled={!online || !us} onClick={() => setCreating((c) => !c)}>
          New transfer
        </Button>
      </div>
      {!online && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{OFFLINE_HINT}</p>}
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      {creating && us && (
        <NewTransferForm us={us} online={online} onClose={() => setCreating(false)} onDone={onDone} />
      )}
      <div role="tablist" aria-label="Transfers" className="flex gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'
            }`}
          >
            {t.label}
            {t.count ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {loadError ? (
        <div className="text-sm text-red-700">
          Couldn&apos;t load transfers.{' '}
          <Button type="button" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
        </div>
      ) : rows === null || !us ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-500">{EMPTY[tab]}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <TransferRow
              key={row.id}
              row={row}
              us={us}
              now={now}
              ours={oursIds.has(row.id)}
              online={online}
              openAction={open?.id === row.id ? open.action : null}
              onOpen={(action) => setOpen(action ? { id: row.id, action } : null)}
              onDone={onDone}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
