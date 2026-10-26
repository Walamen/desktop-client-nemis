'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReportCardClassEntry } from '@nemis-desktop/types';
import { formatNemisId } from '@nemis-desktop/shared';
import { EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { reportCardsBridge } from '@/services/nemis-bridge/shared/report-cards-bridge';
import {
  OpenedReportCard,
  StatusBadge,
  formatIssuedDate,
  issueLabel,
  reportCardErrorMessage,
} from './ReportCardList';

/** A class's students with their latest report card. Read-only: it is used by
 * school administrators and by teachers, and nobody edits a card here. */
export function ClassReportCardsPage({ classId }: { classId: string }) {
  const [entries, setEntries] = useState<ReportCardClassEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Another class: show the loading state, never the previous class's students.
  useEffect(() => {
    setEntries(null);
  }, [classId]);

  const load = useCallback(() => {
    let cancelled = false;
    if (!classId) {
      setError('This class could not be found.');
      return undefined;
    }
    setError(null);
    void (async () => {
      try {
        const result = await reportCardsBridge.listReportCardsForClass(classId);
        if (!cancelled) setEntries(result);
      } catch (e: unknown) {
        if (!cancelled) setError(reportCardErrorMessage(e, 'Could not load report cards.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  useRevalidateOnSync(load, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!entries) return <Skeleton className="h-16 w-full" />;
  if (!entries.some((e) => e.latest)) {
    return <EmptyState title="No report cards have been issued for this class yet." />;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto bg-white border border-slate-300 rounded-card">
        <table className="w-full">
          <thead className="bg-secondary/20 text-slate-700">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-bold uppercase">Student</th>
              <th className="text-left py-3 px-4 text-xs font-bold uppercase">NEMIS ID</th>
              <th className="text-left py-3 px-4 text-xs font-bold uppercase">Latest report card</th>
              <th className="text-left py-3 px-4 text-xs font-bold uppercase">Issued</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map(({ student, latest }) => (
              <tr key={student.id}>
                <td className="py-3 px-4 text-sm font-semibold text-slate-900">{student.fullName}</td>
                <td className="py-3 px-4 text-sm text-slate-700">
                  {student.nemisId ? formatNemisId(student.nemisId) : '—'}
                </td>
                <td className="py-3 px-4 text-sm">
                  {latest ? (
                    <span className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        className="font-medium text-sky-700 hover:underline"
                        onClick={() => setOpenId(latest.issueId)}
                      >
                        {issueLabel(latest)}
                      </button>
                      <StatusBadge status={latest.status} />
                    </span>
                  ) : (
                    <span className="text-slate-400">No report card</span>
                  )}
                </td>
                <td className="py-3 px-4 text-sm text-slate-500">
                  {latest ? formatIssuedDate(latest.issuedAt) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId && <OpenedReportCard key={openId} issueId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
