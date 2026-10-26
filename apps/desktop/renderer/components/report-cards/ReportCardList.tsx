'use client';

import { useCallback, useState } from 'react';
import type { ReportCardIssueDetail, ReportCardSummary } from '@nemis-desktop/types';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { reportCardsBridge } from '@/services/nemis-bridge/shared/report-cards-bridge';
import { ReportCardView } from './ReportCardView';

export function reportCardErrorMessage(error: unknown, fallback: string): string {
  return parseIpcError(error)?.message || fallback;
}

export function issueLabel(s: ReportCardSummary): string {
  const base = s.kind === 'FINAL' ? 'Final report' : (s.gradingPeriodName ?? 'Period report');
  return s.version > 1 ? `${base} (version ${s.version})` : base;
}

export function formatIssuedDate(iso: string): string {
  return iso.slice(0, 10);
}

export function StatusBadge({ status }: { status: ReportCardSummary['status'] }) {
  if (status === 'WITHDRAWN') return <Badge variant="error" size="sm">Withdrawn</Badge>;
  if (status === 'SUPERSEDED') return <Badge variant="warning" size="sm">Replaced by a newer version</Badge>;
  return null;
}

/** Loads one issue and shows it below the list that opened it. */
export function OpenedReportCard({ issueId, onClose }: { issueId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ReportCardIssueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useRevalidateOnSync(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const result = await reportCardsBridge.getReportCardIssue(issueId);
        if (!cancelled) setDetail(result);
      } catch (e: unknown) {
        if (!cancelled) setError(reportCardErrorMessage(e, 'Could not open this report card.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issueId]);

  return (
    <div className="space-y-3">
      <Button size="sm" variant="secondary" onClick={onClose}>Close report card</Button>
      {error ? (
        <ErrorState message={error} />
      ) : !detail ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <ReportCardView payload={detail.payload} status={detail.summary.status} version={detail.summary.version} />
      )}
    </div>
  );
}

/** A student's report cards, grouped by academic year; opening one shows it. */
export function ReportCardList({ studentId }: { studentId: string }) {
  const [items, setItems] = useState<ReportCardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const result = await reportCardsBridge.listReportCardsForStudent(studentId);
        if (!cancelled) setItems(result);
      } catch (e: unknown) {
        if (!cancelled) setError(reportCardErrorMessage(e, 'Could not load report cards.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useRevalidateOnSync(load, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!items) return <Skeleton className="h-16 w-full" />;
  if (items.length === 0) {
    return <EmptyState title="No report cards have been issued for this student yet." />;
  }

  const years = new Map<string, { name: string; rows: ReportCardSummary[] }>();
  for (const row of items) {
    const group = years.get(row.academicYearId) ?? { name: row.academicYearName, rows: [] };
    group.rows.push(row);
    years.set(row.academicYearId, group);
  }

  return (
    <div className="space-y-4">
      {[...years.entries()].map(([yearId, group]) => (
        <div key={yearId}>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">{group.name}</h3>
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded">
            {group.rows.map((row) => (
              <li key={row.issueId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-sm font-medium text-sky-700 hover:underline"
                    onClick={() => setOpenId(row.issueId)}
                  >
                    {issueLabel(row)}
                  </button>
                  <span className="text-xs text-slate-500">
                    {row.className} · {formatIssuedDate(row.issuedAt)}
                  </span>
                </div>
                <StatusBadge status={row.status} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {openId && <OpenedReportCard key={openId} issueId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
