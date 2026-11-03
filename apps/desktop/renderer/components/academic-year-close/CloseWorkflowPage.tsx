'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useViewModel } from '@/hooks/use-view-model';
import { useQueryParam } from '@/hooks/use-query-param';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { academicSetupHref } from '@/lib/academic-setup';
import { Skeleton, ErrorState } from '@nemis-desktop/ui';
import { CLOSED_PENDING_SYNC, CLOSE_UNAVAILABLE } from './close-copy';
import { ConfirmCloseStep } from './ConfirmCloseStep';
import { PromotionStep } from './PromotionStep';
import { ReadinessStep } from './ReadinessStep';

type Step = 'readiness' | 'promotion' | 'confirm' | 'done';

const STEPS: { id: Exclude<Step, 'done'>; label: string }[] = [
  { id: 'readiness', label: '1. Readiness' },
  { id: 'promotion', label: '2. Promotion' },
  { id: 'confirm', label: '3. Confirm' },
];

/** Close Academic Year: readiness, promotion, confirm. Online only; every
 * step reads from the server again when it opens. The workflow is keyed on
 * the year, so a different `?yearId=` starts it afresh (step, refusal,
 * admitted code and every step's own state). */
export function CloseWorkflowPage() {
  const yearId = useQueryParam('yearId');
  return <CloseWorkflow key={yearId} yearId={yearId} />;
}

function CloseWorkflow({ yearId }: { yearId: string }) {
  const vm = useAcademicFoundationViewModel();
  const state = useViewModel(vm.store, (s) => s.academicYears);
  const years = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const year = years?.find((y) => y.id === yearId);
  const isOpen = year?.status === 'ACTIVE' || year?.status === 'REOPENED';
  const [step, setStep] = useState<Step>('readiness');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [closedRefreshed, setClosedRefreshed] = useState(true);
  // The code of the open year once the gate has let it in; null until then.
  const [admittedCode, setAdmittedCode] = useState<string | null>(null);
  const code = year?.code ?? admittedCode ?? '';
  useRevalidateOnSync(() => { void vm.loadAcademicYears(); }, [vm]);
  useEffect(() => {
    if (isOpen && year) setAdmittedCode(year.code);
  }, [isOpen, year]);

  if (!yearId) {
    return <p className="p-6 text-sm text-slate-600">Choose a year to close from Academic Years.</p>;
  }

  // Wait for the years list, and only offer the workflow for an open year.
  // The gate runs until the first load lets the year in: a later reload
  // (a sync finishing, or the close itself) must not unmount the open step
  // and lose its unsaved choices.
  if (admittedCode === null && !(isOpen && year)) {
    if (state.status === 'error') {
      return <ErrorState message="Academic years could not be loaded." onRetry={() => void vm.loadAcademicYears()} />;
    }
    if (!years) return <Skeleton className="m-6 h-24" />;
    if (!year || !isOpen) {
      return (
        <main className="mx-auto max-w-5xl space-y-3 p-6">
          <p className="text-sm text-slate-700">{CLOSE_UNAVAILABLE}</p>
          <Link href={academicSetupHref('years')} className="text-sm text-blue-700 hover:underline">Back to Academic Years</Link>
        </main>
      );
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link href={academicSetupHref('years')} className="text-sm text-blue-700 hover:underline">Back to Academic Years</Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{code ? `Close ${code}` : 'Close academic year'}</h1>
      </div>
      <ol className="flex gap-4 text-sm" aria-label="Steps">
        {STEPS.map((s) => (
          <li key={s.id} aria-current={s.id === step ? 'step' : undefined}
            className={s.id === step ? 'font-semibold text-slate-900' : 'text-slate-500'}>
            {s.label}
          </li>
        ))}
      </ol>
      {step === 'readiness' && (
        <ReadinessStep yearId={yearId} notice={refusal} onContinue={() => { setRefusal(null); setStep('promotion'); }} />
      )}
      {step === 'promotion' && <PromotionStep yearId={yearId} onSaved={() => setStep('confirm')} />}
      {step === 'confirm' && (
        <ConfirmCloseStep
          yearId={yearId}
          code={code}
          onClosed={(refreshed) => { setClosedRefreshed(refreshed); void vm.loadAcademicYears(); setStep('done'); }}
          onRefused={(message) => { setRefusal(message); setStep('readiness'); }}
        />
      )}
      {step === 'done' && (
        <div role="status" className="space-y-3 rounded-card border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p>{closedRefreshed ? `${code} is closed.` : CLOSED_PENDING_SYNC}</p>
          <Link href={academicSetupHref('years')} className="text-blue-700 hover:underline">Back to Academic Years</Link>
        </div>
      )}
    </main>
  );
}
