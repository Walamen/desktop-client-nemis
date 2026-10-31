'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CarryOverMatching, CarryOverPreview } from '@nemis-desktop/types';
import { Button, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { carryOverBridge } from '@/services/nemis-bridge/school-admin/carry-over-bridge';

const queryId = () =>
  typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('id') ?? '');

const CONFIRM = 'Save this matching? It cannot be changed afterwards.';

function MatchSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-2 items-center gap-3 text-sm">
      <span className="text-slate-700">{label}</span>
      <select
        aria-label={label}
        className="rounded border border-slate-300 px-2 py-1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Not matched</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Stage 5: the receiving school matches a transferred child's prior record
 * (the old school's grading periods and subjects) to its own columns, once.
 * Online only: the record lives on the server. */
export function MatchPriorRecordPage() {
  const id = queryId();
  const connectivity = useConnectivityStore();
  const isOnline = useViewModel(connectivity.store, (s) => s.isOnline);
  const [preview, setPreview] = useState<CarryOverPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [matching, setMatching] = useState<CarryOverMatching>({ periods: {}, subjects: {} });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOnline || !id) return;
    let cancelled = false;
    carryOverBridge
      .getCarryOver(id)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setMatching(p.saved ?? p.suggestion);
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(parseIpcError(cause)?.message ?? 'The prior record could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, isOnline]);

  const back = (
    <Link href="/government/school-admin/students" className="text-sm text-blue-700 hover:underline">
      Back to students
    </Link>
  );

  if (!isOnline) {
    return (
      <main className="mx-auto max-w-4xl space-y-3 p-6">
        {back}
        <p className="text-sm text-amber-700">Matching a prior record needs a connection.</p>
      </main>
    );
  }
  if (loadError) return <ErrorState message={loadError} />;
  if (!preview) return <Skeleton className="m-6 h-40" />;

  const readOnly = preview.status === 'SAVED' || saved;
  const save = async () => {
    if (!window.confirm(CONFIRM)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await carryOverBridge.saveCarryOver({
        carryOverId: preview.id,
        periods: preview.sourcePeriods.map((p) => ({
          sourceGradingPeriodId: p.id,
          targetGradingPeriodId: matching.periods[p.id] || null,
        })),
        subjects: preview.sourceSubjects.map((s) => ({
          sourceSubjectId: s.id,
          targetSubjectId: matching.subjects[s.id] || null,
        })),
      });
      setSaved(true);
    } catch (cause) {
      setSaveError(parseIpcError(cause)?.message ?? 'The matching could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  const targetPeriods = preview.targetPeriods.map((p) => ({ id: p.id, label: `${p.termName} — ${p.name}` }));
  const targetSubjects = preview.targetSubjects.map((s) => ({ id: s.id, label: s.name }));

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        {back}
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          Match prior record — {preview.student.firstName} {preview.student.lastName}
        </h1>
        <p className="text-sm text-slate-600">From {preview.fromInstitutionName}</p>
      </div>
      <section className="space-y-2 rounded-card border border-slate-300 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Grading periods</h2>
        {preview.sourcePeriods.map((p) => (
          <MatchSelect
            key={p.id}
            label={`${p.termName} — ${p.name}`}
            value={matching.periods[p.id] ?? ''}
            options={targetPeriods}
            disabled={readOnly}
            onChange={(v) => setMatching((m) => ({ ...m, periods: { ...m.periods, [p.id]: v || null } }))}
          />
        ))}
      </section>
      <section className="space-y-2 rounded-card border border-slate-300 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Subjects</h2>
        {preview.sourceSubjects.map((s) => (
          <MatchSelect
            key={s.id}
            label={s.name}
            value={matching.subjects[s.id] ?? ''}
            options={targetSubjects}
            disabled={readOnly}
            onChange={(v) => setMatching((m) => ({ ...m, subjects: { ...m.subjects, [s.id]: v || null } }))}
          />
        ))}
      </section>
      {saveError && (
        <p role="alert" className="text-sm text-red-700">
          {saveError}
        </p>
      )}
      {saved ? (
        <p role="status" className="text-sm text-green-800">
          Prior record matched.
        </p>
      ) : (
        !readOnly && (
          <div className="flex justify-end">
            <Button type="button" disabled={saving} onClick={() => void save()}>
              Save matching
            </Button>
          </div>
        )
      )}
    </main>
  );
}
