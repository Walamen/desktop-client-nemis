'use client';

import { Fragment, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { DesktopSyncStatus, SyncConflictResult } from '@nemis-desktop/types';
import { Alert, Badge, Button, EmptyState, ErrorState, Modal, Skeleton } from '@nemis-desktop/ui';
import { nemisBridge } from '@/services/nemis-bridge';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { diffFields, pickEntityLabel, relativeTime, unwrapLocalPayload } from './shared';

type Resolution = 'keep_local' | 'accept_remote' | 'retry';
interface ConfirmTarget {
  conflict: SyncConflictResult;
  resolution: 'keep_local' | 'accept_remote';
  // Whether the diff found any field the two sides actually disagree on —
  // lets the confirmation modal tell "you're overwriting a real edit" apart
  // from "this is just clearing a stale notice; nothing is lost."
  hasRealDisagreement: boolean;
}

export function SyncConflictsPage() {
  const [conflicts, setConflicts] = useState<readonly SyncConflictResult[] | null>(null);
  const [syncStatus, setSyncStatus] = useState<DesktopSyncStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

  const load = () => {
    setLoadError(null);
    void Promise.all([nemisBridge.listSyncConflicts(), nemisBridge.getSyncStatus()])
      .then(([list, status]) => {
        setConflicts(list);
        setSyncStatus(status);
      })
      .catch(() => setLoadError('Could not load sync conflicts. Check your connection and try again.'));
  };

  useRevalidateOnSync(load, []);

  const resolve = async (conflictId: string, resolution: Resolution) => {
    setResolving(conflictId);
    setResolveError(null);
    try {
      await nemisBridge.resolveSyncConflict(conflictId, resolution);
      setConflicts((current) => current?.filter((item) => item.id !== conflictId) ?? current);
      if (resolution === 'keep_local' || resolution === 'retry') void nemisBridge.runSync();
    } catch {
      setResolveError('That didn’t go through. Check your connection and try again.');
    } finally {
      setResolving(null);
      setConfirmTarget(null);
    }
  };

  const decisions = conflicts?.filter((c) => c.source !== 'dead_letter') ?? [];
  const retries = conflicts?.filter((c) => c.source === 'dead_letter') ?? [];

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sync conflicts</h1>
          <p className="mt-1 text-sm text-slate-500">
            These offline changes couldn&apos;t be applied automatically. Review each one and choose what happens next.
          </p>
        </div>
        {conflicts !== null && conflicts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {decisions.length > 0 && (
              <Badge variant="warning">{decisions.length} need{decisions.length === 1 ? 's' : ''} a decision</Badge>
            )}
            {retries.length > 0 && (
              <Badge variant="error">{retries.length} failed to sync</Badge>
            )}
          </div>
        )}
      </div>

      {resolveError && <Alert variant="error">{resolveError}</Alert>}

      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : conflicts === null ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
        </div>
      ) : conflicts.length === 0 ? (
        <EmptyState
          title="You're fully in sync"
          description={
            syncStatus?.lastSyncAt
              ? `There are no unresolved conflicts. Last synced ${relativeTime(syncStatus.lastSyncAt)}.`
              : 'There are no unresolved conflicts.'
          }
        />
      ) : (
        <div className="space-y-6">
          {decisions.length > 0 && (
            <section aria-live="polite">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-pending">
                <AlertTriangle className="h-4 w-4" />
                Needs your decision
              </h2>
              <div className="space-y-3">
                {decisions.map((conflict) => (
                  <ConflictCard
                    key={conflict.id}
                    conflict={conflict}
                    resolving={resolving === conflict.id}
                    onKeepLocal={(hasRealDisagreement) =>
                      setConfirmTarget({ conflict, resolution: 'keep_local', hasRealDisagreement })
                    }
                    onAcceptRemote={(hasRealDisagreement) =>
                      setConfirmTarget({ conflict, resolution: 'accept_remote', hasRealDisagreement })
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {retries.length > 0 && (
            <section aria-live="polite">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-error">
                <RefreshCw className="h-4 w-4" />
                Failed to sync
              </h2>
              <div className="space-y-3">
                {retries.map((conflict) => (
                  <RetryCard
                    key={conflict.id}
                    conflict={conflict}
                    resolving={resolving === conflict.id}
                    onRetry={() => void resolve(conflict.id, 'retry')}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={
          confirmTarget?.resolution === 'accept_remote'
            ? confirmTarget.hasRealDisagreement
              ? 'Discard your offline change?'
              : 'Use the server’s version?'
            : 'Keep your offline change?'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmTarget?.resolution === 'accept_remote' && confirmTarget.hasRealDisagreement ? 'destructive' : 'primary'}
              loading={resolving === confirmTarget?.conflict.id}
              onClick={() => confirmTarget && void resolve(confirmTarget.conflict.id, confirmTarget.resolution)}
            >
              {confirmTarget?.resolution === 'accept_remote'
                ? confirmTarget.hasRealDisagreement
                  ? 'Discard and accept server version'
                  : 'Use server version'
                : 'Keep my change'}
            </Button>
          </>
        }
      >
        {confirmTarget && (
          <p className="text-sm text-slate-600">
            {confirmTarget.resolution === 'accept_remote' ? (
              confirmTarget.hasRealDisagreement ? (
                <>
                  The offline change you made to{' '}
                  <strong>{pickEntityLabel(confirmTarget.conflict.localPayload, confirmTarget.conflict.remotePayload, confirmTarget.conflict.entityType, confirmTarget.conflict.entityId)}</strong>{' '}
                  will be permanently replaced by the server&apos;s version. This can&apos;t be undone.
                </>
              ) : (
                <>
                  Nothing is lost here — the server already reflects your offline entry for{' '}
                  <strong>{pickEntityLabel(confirmTarget.conflict.localPayload, confirmTarget.conflict.remotePayload, confirmTarget.conflict.entityType, confirmTarget.conflict.entityId)}</strong>,
                  plus a few details only the server fills in. This just clears the notice.
                </>
              )
            ) : confirmTarget.hasRealDisagreement ? (
              <>
                Your offline change to{' '}
                <strong>{pickEntityLabel(confirmTarget.conflict.localPayload, confirmTarget.conflict.remotePayload, confirmTarget.conflict.entityType, confirmTarget.conflict.entityId)}</strong>{' '}
                will overwrite what&apos;s on the server. This can&apos;t be undone.
              </>
            ) : (
              <>
                Your offline entry for{' '}
                <strong>{pickEntityLabel(confirmTarget.conflict.localPayload, confirmTarget.conflict.remotePayload, confirmTarget.conflict.entityType, confirmTarget.conflict.entityId)}</strong>{' '}
                will be resent to the server. Nothing here actually conflicts, so this is safe.
              </>
            )}
          </p>
        )}
      </Modal>
    </div>
  );
}

function ConflictCard({
  conflict,
  resolving,
  onKeepLocal,
  onAcceptRemote,
}: {
  conflict: SyncConflictResult;
  resolving: boolean;
  onKeepLocal: (hasRealDisagreement: boolean) => void;
  onAcceptRemote: (hasRealDisagreement: boolean) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const label = pickEntityLabel(conflict.localPayload, conflict.remotePayload, conflict.entityType, conflict.entityId);
  // localPayload is the outbox envelope, not a bare record — `edited` is the
  // actual offline change (what the diff below must compare), never the
  // envelope itself. See unwrapLocalPayload's doc comment for why.
  const { edited } = unwrapLocalPayload(conflict.localPayload);
  const isDelete = conflict.operationType === 'delete';
  const { rows, comparable } = diffFields(edited, conflict.remotePayload);
  const contentRows = rows.filter((row) => row.bucket === 'content');
  const serverAssignedRows = rows.filter((row) => row.bucket === 'serverAssigned');
  const detailRows = rows.filter((row) => row.bucket === 'metadata' || row.bucket === 'unchanged');
  // Genuinely nothing to arbitrate — every difference is either the server
  // filling in something the offline entry couldn't have known, or sync
  // bookkeeping. Common right after creating a record: the server assigns
  // an ID/status the moment it accepts it, and a stray second local write
  // (see unwrapLocalPayload's version-vs-updatedAt clock-skew note) can
  // still trip this "conflict" even though nothing actually disagrees.
  const hasRealDisagreement = comparable && contentRows.length > 0;
  // Distinct from `!hasRealDisagreement`: this is only true once the diff
  // actually ran and confirmed nothing conflicts — not when comparison
  // wasn't possible at all (raw-fallback case), where recommending either
  // side would be a guess.
  const confirmedNoRealDisagreement = comparable && !hasRealDisagreement && !isDelete;

  return (
    <article
      className={`rounded-card border border-slate-200 border-l-4 bg-white p-5 ${
        isDelete || hasRealDisagreement || !comparable ? 'border-l-pending' : 'border-l-secondary'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">{label}</h3>
          <p className="mt-1 text-sm text-slate-600">{conflict.reason}</p>
        </div>
        <time className="whitespace-nowrap text-xs text-slate-500" dateTime={conflict.createdAt}>
          {relativeTime(conflict.createdAt)}
        </time>
      </div>

      {isDelete ? (
        <p className="mt-4 rounded-md bg-pending/10 px-3 py-2 text-sm text-slate-700">
          You deleted this record while offline. The server still has it — choose whether to keep the deletion or
          restore the server&apos;s copy.
        </p>
      ) : !comparable ? (
        <div className="mt-4">
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            onClick={() => setShowRaw((prev) => !prev)}
            aria-expanded={showRaw}
          >
            {showRaw ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {showRaw ? 'Hide' : 'View'} raw preserved data
          </button>
          {showRaw && (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <pre className="overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(edited, null, 2)}
              </pre>
              <pre className="overflow-auto rounded-md bg-slate-100 p-3 text-xs text-slate-800">
                {JSON.stringify(conflict.remotePayload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : !hasRealDisagreement ? (
        <div className="mt-4 rounded-md border border-secondary/20 bg-secondary/10 px-4 py-3">
          <p className="text-sm text-slate-700">
            No real difference was found between what you entered offline and what&apos;s already on the national
            server — this looks like a sync timing hiccup, not an actual disagreement. It&apos;s safe to use the
            server&apos;s version.
            {serverAssignedRows.length > 0 && (
              <>
                {' '}
                The server also filled in {serverAssignedRows.map((row) => row.label.toLowerCase()).join(', ')}{' '}
                automatically.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-[minmax(120px,180px)_1fr_1fr] sm:items-start sm:gap-x-4">
            <div className="hidden sm:block" />
            <div className="hidden text-xs font-semibold uppercase tracking-wide text-slate-400 sm:block">
              Your offline change
            </div>
            <div className="hidden text-xs font-semibold uppercase tracking-wide text-slate-400 sm:block">
              Server has
            </div>
            {contentRows.map((row) => (
              <Fragment key={row.key}>
                <div className="text-sm font-medium text-slate-600 sm:pt-2">{row.label}</div>
                <div className="rounded-md bg-pending/10 px-3 py-2 text-sm text-slate-800">{row.local}</div>
                <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">{row.remote}</div>
              </Fragment>
            ))}
          </div>
          {serverAssignedRows.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              The server also filled in: {serverAssignedRows.map((row) => row.label).join(', ')}.
            </p>
          )}
        </div>
      )}

      {comparable && detailRows.length > 0 && (
        <>
          <button
            type="button"
            className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-expanded={showDetails}
          >
            {showDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {showDetails ? 'Hide' : 'Show'} {detailRows.length} more detail{detailRows.length === 1 ? '' : 's'}
          </button>
          {showDetails && (
            <div className="mt-2 grid grid-cols-1 gap-y-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(120px,180px)_1fr_1fr] sm:gap-x-4">
              {detailRows.map((row) => (
                <Fragment key={row.key}>
                  <div className="text-sm text-slate-500 sm:pt-1">{row.label}</div>
                  <div className="text-sm text-slate-500 sm:col-span-2">{row.local}</div>
                </Fragment>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Button
          size="sm"
          variant={confirmedNoRealDisagreement ? 'secondary' : 'primary'}
          disabled={resolving}
          onClick={() => onKeepLocal(hasRealDisagreement)}
        >
          {isDelete ? 'Confirm deletion' : 'Keep my offline change'}
        </Button>
        <Button
          size="sm"
          variant={confirmedNoRealDisagreement ? 'primary' : 'destructive'}
          disabled={resolving}
          onClick={() => onAcceptRemote(hasRealDisagreement)}
        >
          {isDelete ? "Restore server's copy" : 'Accept server version'}
        </Button>
      </div>
    </article>
  );
}

function RetryCard({
  conflict,
  resolving,
  onRetry,
}: {
  conflict: SyncConflictResult;
  resolving: boolean;
  onRetry: () => void;
}) {
  const label = pickEntityLabel(conflict.localPayload, conflict.remotePayload, conflict.entityType, conflict.entityId);
  return (
    <article className="rounded-card border border-slate-200 border-l-4 border-l-error bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">{label}</h3>
          <p className="mt-1 text-sm text-slate-600">{conflict.reason}</p>
          <time className="mt-1 block text-xs text-slate-500" dateTime={conflict.createdAt}>
            {relativeTime(conflict.createdAt)}
          </time>
        </div>
        <Button size="sm" loading={resolving} onClick={onRetry}>
          {resolving ? 'Retrying…' : 'Retry sync'}
        </Button>
      </div>
    </article>
  );
}
