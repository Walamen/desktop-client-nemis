'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type {
  DesktopSyncStatus,
  PendingGroupSummary,
  PendingItemState,
  PendingRecord,
  PendingSummary,
} from '@nemis-desktop/types';
import { Alert, Badge, Button, EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { nemisBridge } from '@/services/nemis-bridge';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { relativeTime, retryCountdown } from './shared';

const PAGE_SIZE = 50;
const MAX_REQUEST = 200;
const POLL_MS = 5_000;

const STATE_ORDER: readonly PendingItemState[] = ['sending', 'waiting', 'retrying', 'held'];
const CHIP_VARIANT: Record<PendingItemState, 'primary' | 'neutral' | 'warning'> = {
  sending: 'primary',
  waiting: 'neutral',
  retrying: 'warning',
  held: 'warning',
};
const OPERATION_LABEL: Record<PendingRecord['operationType'], string> = {
  create: 'New',
  update: 'Edited',
  delete: 'Deleted',
};

function stateText(record: PendingRecord, isOnline: boolean): string {
  switch (record.state) {
    case 'sending':
      return 'Sending';
    case 'waiting':
      return isOnline ? 'Waiting' : 'Waiting for connection';
    case 'retrying':
      return record.nextAttemptAt ? `Retrying ${retryCountdown(record.nextAttemptAt)}` : 'Retrying';
    case 'held':
      return 'Held behind an earlier item';
  }
}

export function SyncPendingPage() {
  const pathname = usePathname();
  const portalBase = (pathname ?? '/government/school-admin').split('/').slice(0, 3).join('/');
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [status, setStatus] = useState<DesktopSyncStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  // Bumped on every successful summary load so expanded groups refresh too.
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;
    void Promise.all([nemisBridge.listPendingChanges(), nemisBridge.getSyncStatus()])
      .then(([nextSummary, nextStatus]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setStatus(nextStatus);
        setLoadError(null);
        setRefreshToken((token) => token + 1);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load pending changes. Your work is still saved on this computer.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useRevalidateOnSync(load, []);
  useEffect(() => {
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await nemisBridge.runSync();
    } catch {
      setSyncError('Sync could not finish. Your changes are still saved on this computer and will be retried.');
    } finally {
      setSyncing(false);
      load();
    }
  };

  const isOnline = status?.isOnline ?? true;
  const failed = summary?.failedCount ?? 0;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pending changes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Work saved on this computer that hasn&apos;t reached the national server yet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {status?.lastSyncAt && (
            <span className="text-xs text-slate-500">Last synced {relativeTime(status.lastSyncAt)}</span>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showTechnical}
              onChange={(event) => setShowTechnical(event.target.checked)}
            />
            Show technical details
          </label>
          <Button size="sm" loading={syncing} onClick={() => void syncNow()}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </div>

      {!isOnline && (
        <Alert variant="info">
          You&apos;re offline. These changes are safe on this computer and will send automatically when you reconnect.
        </Alert>
      )}
      {syncError && <Alert variant="error">{syncError}</Alert>}
      {failed > 0 && (
        <Alert variant="error">
          {failed} item{failed === 1 ? '' : 's'} failed to sync and need{failed === 1 ? 's' : ''} attention.{' '}
          <Link className="font-semibold underline" href={`${portalBase}/sync-conflicts`}>
            Review sync conflicts →
          </Link>
        </Alert>
      )}
      {summary?.partial && (
        <Alert variant="warning">Some pending items couldn&apos;t be listed. They are still saved and will sync.</Alert>
      )}
      {loadError && summary && <Alert variant="warning">{loadError}</Alert>}

      {summary === null ? (
        loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
          </div>
        )
      ) : summary.groups.length === 0 ? (
        <EmptyState
          title="Everything is synced"
          description={status?.lastSyncAt ? `Last synced ${relativeTime(status.lastSyncAt)}.` : undefined}
        />
      ) : (
        <section aria-live="polite" aria-label="Pending changes by type" className="space-y-3">
          {summary.groups.map((group) => (
            <GroupCard
              key={group.groupKey}
              group={group}
              isOnline={isOnline}
              showTechnical={showTechnical}
              refreshToken={refreshToken}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function GroupCard({
  group,
  isOnline,
  showTechnical,
  refreshToken,
}: {
  group: PendingGroupSummary;
  isOnline: boolean;
  showTechnical: boolean;
  refreshToken: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState<PendingRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedCount = useRef(0);

  /** Reads [offset, offset+count) in requests of at most MAX_REQUEST. */
  const fetchRange = useCallback(
    async (offset: number, count: number) => {
      const out: PendingRecord[] = [];
      let latestTotal = 0;
      for (let start = offset; start < offset + count; start += MAX_REQUEST) {
        const page = await nemisBridge.listPendingRecords({
          groupKey: group.groupKey,
          limit: Math.min(MAX_REQUEST, offset + count - start),
          offset: start,
        });
        out.push(...page.records);
        latestTotal = page.total;
        if (page.records.length === 0 || start + page.records.length >= page.total) break;
      }
      return { records: out, total: latestTotal };
    },
    [group.groupKey],
  );

  const apply = (next: PendingRecord[], nextTotal: number) => {
    setRecords(next);
    setTotal(nextTotal);
    loadedCount.current = next.length;
  };

  const loadFirstPage = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRange(0, PAGE_SIZE);
      apply(result.records, result.total);
    } catch {
      setError('Could not load these items. Try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!records) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRange(records.length, PAGE_SIZE);
      apply([...records, ...result.records], result.total);
    } catch {
      setError('Could not load more items. Try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && records === null) void loadFirstPage();
  };

  // Keep an open group in step with each summary refresh.
  useEffect(() => {
    if (!expanded || loadedCount.current === 0) return;
    let cancelled = false;
    void fetchRange(0, Math.max(loadedCount.current, PAGE_SIZE))
      .then((result) => {
        if (!cancelled) apply(result.records, result.total);
      })
      .catch(() => {
        if (!cancelled) setError('Could not refresh these items. Showing the last list loaded.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  return (
    <article className="rounded-card border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={toggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left"
      >
        <span className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-semibold text-slate-900">{group.label}</span>
          <span className="text-sm text-slate-500">{group.total}</span>
          {showTechnical && <code className="text-xs text-slate-400">{group.groupKey}</code>}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {STATE_ORDER.filter((state) => group.byState[state] > 0).map((state) => (
            <Badge key={state} size="sm" variant={CHIP_VARIANT[state]}>
              {`${group.byState[state]} ${state}`}
            </Badge>
          ))}
          <span className="text-xs text-slate-500">Oldest: {relativeTime(group.oldestAt)}</span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5">
          {error && <Alert variant="error" className="mt-4">{error}</Alert>}
          {records === null ? (
            loading && <Skeleton className="mt-4 h-16 w-full" />
          ) : records.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">These changes have just synced.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {records.map((record) => (
                <RecordRow key={record.id} record={record} isOnline={isOnline} showTechnical={showTechnical} />
              ))}
            </ul>
          )}
          {records !== null && records.length < total && (
            <Button size="sm" variant="secondary" className="mt-3" loading={loading} onClick={() => void loadMore()}>
              Load more ({total - records.length} remaining)
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function RecordRow({
  record,
  isOnline,
  showTechnical,
}: {
  record: PendingRecord;
  isOnline: boolean;
  showTechnical: boolean;
}) {
  const [showPayload, setShowPayload] = useState(false);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{record.label}</p>
          <p className="text-xs text-slate-500">
            {OPERATION_LABEL[record.operationType]} · {stateText(record, isOnline)}
          </p>
        </div>
        <time className="whitespace-nowrap text-xs text-slate-500" dateTime={record.createdAt}>
          {relativeTime(record.createdAt)}
        </time>
      </div>
      {showTechnical && (
        <div className="mt-2 text-xs text-slate-500">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            <dt>Entity</dt>
            <dd><code>{record.entityType}</code> · <code>{record.entityId}</code></dd>
            <dt>Record ID</dt>
            <dd><code>{record.id}</code></dd>
            <dt>Retries</dt>
            <dd>{record.retryCount}</dd>
            <dt>Last error</dt>
            <dd>{record.lastError ?? '—'}</dd>
          </dl>
          <button
            type="button"
            className="mt-2 flex items-center gap-1 font-medium hover:text-slate-700"
            aria-expanded={showPayload}
            onClick={() => setShowPayload((prev) => !prev)}
          >
            {showPayload ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {showPayload ? 'Hide' : 'View'} payload
          </button>
          {showPayload && (
            <pre className="mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(record.payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
