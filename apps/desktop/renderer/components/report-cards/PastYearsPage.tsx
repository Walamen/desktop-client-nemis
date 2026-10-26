'use client';

import { useCallback, useState } from 'react';
import type { ReportCardArchivedYear } from '@nemis-desktop/types';
import { Button, EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { reportCardsBridge } from '@/services/nemis-bridge/shared/report-cards-bridge';
import { ClassReportCardsPage } from './ClassReportCardsPage';
import { reportCardErrorMessage } from './ReportCardList';

/** Report cards of closed years: year, then class, then the class's cards.
 * Read-only; shared by school administrators and teachers (the main process
 * decides which classes each of them may open). */
export function PastYearsPage() {
  const [years, setYears] = useState<ReportCardArchivedYear[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearId, setYearId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const result = await reportCardsBridge.listReportCardArchivedYears();
        if (!cancelled) setYears(result);
      } catch (e: unknown) {
        if (!cancelled) setError(reportCardErrorMessage(e, 'Could not load past years.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useRevalidateOnSync(load, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!years) return <Skeleton className="h-16 w-full" />;
  if (years.length === 0) {
    return <EmptyState title="No academic year has been closed yet." />;
  }

  const year = years.find((y) => y.academicYearId === yearId) ?? null;
  const klass = year?.classes.find((c) => c.classId === classId) ?? null;

  if (year && klass) {
    return (
      <div className="space-y-4">
        <Button size="sm" variant="secondary" onClick={() => setClassId(null)}>
          Back to {year.code}
        </Button>
        <h2 className="text-base font-semibold text-slate-800">
          {klass.name} · {year.code}
        </h2>
        <ClassReportCardsPage classId={klass.classId} />
      </div>
    );
  }

  if (year) {
    return (
      <div className="space-y-4">
        <Button size="sm" variant="secondary" onClick={() => setYearId(null)}>
          Back to past years
        </Button>
        <h2 className="text-base font-semibold text-slate-800">{year.code}</h2>
        {year.classes.length === 0 ? (
          <EmptyState title="No classes with report cards in this year." />
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded bg-white">
            {year.classes.map((c) => (
              <li key={c.classId} className="px-3 py-2">
                <button
                  type="button"
                  className="text-sm font-medium text-sky-700 hover:underline"
                  onClick={() => setClassId(c.classId)}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 border border-slate-200 rounded bg-white">
      {years.map((y) => (
        <li key={y.academicYearId} className="flex items-center justify-between gap-2 px-3 py-2">
          <button
            type="button"
            className="text-sm font-medium text-sky-700 hover:underline"
            onClick={() => setYearId(y.academicYearId)}
          >
            {y.code}
          </button>
          <span className="text-xs text-slate-500">{y.status === 'REOPENED' ? 'Reopened' : 'Closed'}</span>
        </li>
      ))}
    </ul>
  );
}
