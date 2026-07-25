'use client';

import { useEffect, useState } from 'react';
import type { SyncConflictResult } from '@nemis-desktop/types';
import { nemisBridge } from '@/services/nemis-bridge';

export function SyncConflictsPage() {
  const [conflicts, setConflicts] = useState<readonly SyncConflictResult[] | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  useEffect(() => {
    void nemisBridge.listSyncConflicts().then(setConflicts);
  }, []);
  const resolve = async (
    conflictId: string,
    resolution: 'keep_local' | 'accept_remote',
  ) => {
    setResolving(conflictId);
    try {
      await nemisBridge.resolveSyncConflict(conflictId, resolution);
      setConflicts((current) => current?.filter((item) => item.id !== conflictId) ?? []);
      if (resolution === 'keep_local') void nemisBridge.runSync();
    } finally {
      setResolving(null);
    }
  };
  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-slate-950">Synchronization conflicts</h1>
        <p className="mt-2 text-sm text-slate-600">
          These offline changes were preserved because the server could not safely apply them.
        </p>
        <div className="mt-6 space-y-3">
          {conflicts === null ? (
            <p className="text-sm text-slate-500">Loading conflicts…</p>
          ) : conflicts.length === 0 ? (
            <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">
              There are no unresolved conflicts.
            </div>
          ) : conflicts.map((conflict) => (
            <article key={conflict.id} className="rounded-xl border border-red-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {conflict.entityType} · {conflict.entityId}
                  </h2>
                  <p className="mt-1 text-sm text-red-700">{conflict.reason}</p>
                </div>
                <time className="text-xs text-slate-500">{new Date(conflict.createdAt).toLocaleString()}</time>
              </div>
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer font-medium text-slate-700">Compare preserved data</summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <pre className="overflow-auto rounded bg-slate-950 p-3 text-slate-100">{JSON.stringify(conflict.localPayload, null, 2)}</pre>
                  <pre className="overflow-auto rounded bg-slate-100 p-3 text-slate-800">{JSON.stringify(conflict.remotePayload, null, 2)}</pre>
                </div>
              </details>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={resolving === conflict.id}
                  className="rounded bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  onClick={() => void resolve(conflict.id, 'keep_local')}
                >
                  Retry my offline change
                </button>
                <button
                  type="button"
                  disabled={resolving === conflict.id}
                  className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  onClick={() => void resolve(conflict.id, 'accept_remote')}
                >
                  Accept server version
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
