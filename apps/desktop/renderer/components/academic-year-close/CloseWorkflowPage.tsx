'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { academicSetupHref } from '@/lib/academic-setup';
import { ConfirmCloseStep } from './ConfirmCloseStep';
import { PromotionStep } from './PromotionStep';
import { ReadinessStep } from './ReadinessStep';

type Step = 'readiness' | 'promotion' | 'confirm' | 'done';

const STEPS: { id: Exclude<Step, 'done'>; label: string }[] = [
  { id: 'readiness', label: '1. Readiness' },
  { id: 'promotion', label: '2. Promotion' },
  { id: 'confirm', label: '3. Confirm' },
];

const queryYearId = () =>
  typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('yearId') ?? '');

/** Close Academic Year: readiness, promotion, confirm. Online only; every
 * step reads from the server again when it opens. */
export function CloseWorkflowPage() {
  const yearId = queryYearId();
  const vm = useAcademicFoundationViewModel();
  const state = useViewModel(vm.store, (s) => s.academicYears);
  const years = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const code = years?.find((y) => y.id === yearId)?.code ?? '';
  const [step, setStep] = useState<Step>('readiness');
  const [refusal, setRefusal] = useState<string | null>(null);
  useRevalidateOnSync(() => { void vm.loadAcademicYears(); }, [vm]);

  if (!yearId) {
    return <p className="p-6 text-sm text-slate-600">Choose a year to close from Academic Years.</p>;
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
          onClosed={() => { void vm.loadAcademicYears(); setStep('done'); }}
          onRefused={(message) => { setRefusal(message); setStep('readiness'); }}
        />
      )}
      {step === 'done' && (
        <div role="status" className="space-y-3 rounded-card border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p>{code} is closed.</p>
          <Link href={academicSetupHref('years')} className="text-blue-700 hover:underline">Back to Academic Years</Link>
        </div>
      )}
    </main>
  );
}
