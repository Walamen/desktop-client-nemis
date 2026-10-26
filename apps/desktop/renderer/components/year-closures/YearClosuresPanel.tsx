'use client';

import { useCallback, useState } from 'react';
import type { YearClosureRow } from '@nemis-desktop/types';
import { Badge, EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { yearArchivesBridge } from '@/services/nemis-bridge/shared/year-archives-bridge';

/** Years the schools in this workspace have closed: per school its year,
 * Closed/Reopened status, closed date and the end-of-year outcome counts.
 * Shown on the district and county dashboards. */
export function YearClosuresPanel() {
  const [rows, setRows] = useState<YearClosureRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const result = await yearArchivesBridge.listYearClosures();
        if (!cancelled) setRows(result);
      } catch (e: unknown) {
        if (!cancelled) setError(parseIpcError(e)?.message || 'Could not load year closures.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useRevalidateOnSync(load, [load]);

  return (
    <section aria-label="Year closures" className="bg-white border border-slate-300 p-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Year closures</p>
      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !rows ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title="No school has closed an academic year yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-600">
              <tr>
                <th scope="col" className="text-left py-2 pr-3 text-xs font-bold uppercase">School</th>
                <th scope="col" className="text-left py-2 pr-3 text-xs font-bold uppercase">Year</th>
                <th scope="col" className="text-left py-2 pr-3 text-xs font-bold uppercase">Status</th>
                <th scope="col" className="text-left py-2 pr-3 text-xs font-bold uppercase">Closed</th>
                <th scope="col" className="text-right py-2 pr-3 text-xs font-bold uppercase">Promoted</th>
                <th scope="col" className="text-right py-2 pr-3 text-xs font-bold uppercase">Retained</th>
                <th scope="col" className="text-right py-2 text-xs font-bold uppercase">Graduated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.institutionId}:${r.academicYearId}`}>
                  <td className="py-2 pr-3 font-medium text-slate-900">{r.schoolName}</td>
                  <td className="py-2 pr-3">{r.yearCode}</td>
                  <td className="py-2 pr-3">
                    {r.status === 'REOPENED' ? (
                      <Badge variant="warning" size="sm">Reopened</Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">Closed</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3">{r.closedAt ? r.closedAt.slice(0, 10) : '—'}</td>
                  <td className="py-2 pr-3 text-right">{r.promoted}</td>
                  <td className="py-2 pr-3 text-right">{r.retained}</td>
                  <td className="py-2 text-right">{r.graduated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
