'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  CompletionOutcome,
  PromotionStudent,
  ReportCardIssueDetail,
} from '@nemis-desktop/types';
import { Button, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { academicSetupHref } from '@/lib/academic-setup';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { academicYearCloseBridge } from '@/services/nemis-bridge/school-admin/academic-year-close-bridge';
import { reportCardsBridge } from '@/services/nemis-bridge/shared/report-cards-bridge';
import { ReportCardView } from '@/components/report-cards/ReportCardView';
import {
  CLOSE_AGAIN_LABEL,
  CORRECTION_REASON_LABEL,
  OFFLINE_MESSAGE,
  OUTCOME_LABEL,
  CORRECTIONS_UNAVAILABLE,
  SAVED_PENDING_SYNC,
  correctionsTitle,
  gradeLabel,
  nextGradeFor,
  outcomesFor,
} from './close-copy';

const queryYearId = () =>
  typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('yearId') ?? '');

const closeHref = (yearId: string) =>
  `/government/school-admin/academic-years/close?yearId=${encodeURIComponent(yearId)}`;

const inputClass = 'mt-1 block w-full rounded border border-slate-300 px-2 py-1';

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm text-slate-700">
      {CORRECTION_REASON_LABEL}
      <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Corrections for a REOPENED year: find a student, see their FINAL card,
 * correct a mark, an outcome or the principal's remark. Online only; every
 * action needs a reason. */
export function CorrectionsPage() {
  const yearId = queryYearId();
  const vm = useAcademicFoundationViewModel();
  const yearsState = useViewModel(vm.store, (s) => s.academicYears);
  const years = yearsState.status === 'success' || yearsState.status === 'refreshing' ? yearsState.data : null;
  useEffect(() => { void vm.loadAcademicYears(); }, [vm]);

  const unavailable = (
    <main className="mx-auto max-w-5xl space-y-3 p-6">
      <p className="text-sm text-slate-700">{CORRECTIONS_UNAVAILABLE}</p>
      <Link href={academicSetupHref('years')} className="text-sm text-blue-700 hover:underline">Back to Academic Years</Link>
    </main>
  );
  if (!yearId) return unavailable;
  if (yearsState.status === 'error') {
    return <ErrorState message="Academic years could not be loaded." onRetry={() => void vm.loadAcademicYears()} />;
  }
  if (!years) return <Skeleton className="m-6 h-24" />;
  const year = years.find((y) => y.id === yearId);
  if (!year || year.status !== 'REOPENED') return unavailable;
  return <CorrectionsScreen yearId={yearId} code={year.code} />;
}

function CorrectionsScreen({ yearId, code }: { yearId: string; code: string }) {
  const router = useRouter();
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);

  const [cohort, setCohort] = useState<PromotionStudent[] | null>(null);
  const [cohortError, setCohortError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Always the freshest cohort entry, so a changed outcome shows at once.
  const selected = cohort?.find((s) => s.studentId === selectedId) ?? null;

  const loadCohort = useCallback(async () => {
    setCohortError(null);
    try {
      setCohort((await academicYearCloseBridge.getClosePromotion(yearId)).students);
    } catch (cause) {
      setCohortError(parseIpcError(cause)?.message || 'Students could not be loaded. Please try again.');
    }
  }, [yearId]);
  useEffect(() => { if (yearId) void loadCohort(); }, [yearId, loadCohort]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!cohort || q === '') return [];
    return cohort.filter((s) => s.name.toLowerCase().includes(q) || s.nemisId.includes(q)).slice(0, 20);
  }, [cohort, search]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <Link href={academicSetupHref('years')} className="text-sm text-blue-700 hover:underline">Back to Academic Years</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{correctionsTitle(code)}</h1>
          <Button onClick={() => router.push(closeHref(yearId))}>{CLOSE_AGAIN_LABEL}</Button>
        </div>
      </div>
      {!online && <p className="text-sm text-slate-500">{OFFLINE_MESSAGE}</p>}

      <section className="space-y-2" aria-label="Student search">
        <label className="block text-sm text-slate-700">
          Find a student
          <input
            className={`${inputClass} max-w-sm`}
            placeholder="Name or NEMIS ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {cohortError && <ErrorState message={cohortError} onRetry={() => void loadCohort()} />}
        {!cohort && !cohortError && <Skeleton className="h-10 w-full" />}
        {matches.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
            {matches.map((s) => (
              <li key={s.studentId}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => setSelectedId(s.studentId)}
                >
                  {s.name} <span className="text-slate-500">· {gradeLabel(s.gradeLevel)} · {s.nemisId}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {cohort && search.trim() !== '' && matches.length === 0 && (
          <p className="text-sm text-slate-500">No student in this year matches that search.</p>
        )}
      </section>

      {selected && (
        <StudentCorrections key={selected.studentId} yearId={yearId} student={selected} online={online} onChanged={loadCohort} />
      )}
    </main>
  );
}

function StudentCorrections({
  yearId, student, online, onChanged,
}: { yearId: string; student: PromotionStudent; online: boolean; onChanged: () => Promise<void> }) {
  const [detail, setDetail] = useState<ReportCardIssueDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noCard, setNoCard] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCard = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await reportCardsBridge.listReportCardsForStudent(student.studentId);
      const final = list.find((c) => c.academicYearId === yearId && c.kind === 'FINAL' && c.status === 'CURRENT');
      if (!final) {
        setDetail(null);
        setNoCard(true);
        return;
      }
      setNoCard(false);
      setDetail(await reportCardsBridge.getReportCardIssue(final.issueId));
    } catch (cause) {
      setLoadError(parseIpcError(cause)?.message || 'The final report card could not be loaded.');
    }
  }, [student.studentId, yearId]);
  useEffect(() => { void loadCard(); }, [loadCard]);

  const done = async (message: string) => {
    setNotice(message);
    await Promise.all([loadCard(), onChanged()]);
  };

  return (
    <section className="space-y-4" aria-label={`Corrections for ${student.name}`}>
      <h2 className="text-lg font-semibold text-slate-900">{student.name}</h2>
      {notice && <p role="status" className="rounded-card border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {loadError ? (
        <ErrorState message={loadError} onRetry={() => void loadCard()} />
      ) : noCard ? (
        <p className="text-sm text-slate-600">This student has no final report card in this year.</p>
      ) : !detail ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <ReportCardView payload={detail.payload} status={detail.summary.status} version={detail.summary.version} />
      )}
      {detail && (
        <div className="grid gap-4 md:grid-cols-3">
          <MarkForm yearId={yearId} studentId={student.studentId} detail={detail} online={online} onDone={done} />
          {student.kind === 'PRESENT' && (
            <OutcomeForm key={student.decision?.outcome ?? 'none'} yearId={yearId} student={student} online={online} onDone={done} />
          )}
          <RemarkForm yearId={yearId} student={student} detail={detail} online={online} onDone={done} />
        </div>
      )}
    </section>
  );
}

interface FormProps { yearId: string; online: boolean; onDone: (message: string) => Promise<void> }

/** Runs one correction: failures show the server message. */
function useSubmit(onDone: FormProps['onDone'], success: string) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<{ refreshed: boolean }>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      await onDone(result.refreshed === false ? SAVED_PENDING_SYNC : success);
    } catch (cause) {
      setError(parseIpcError(cause)?.message || 'The correction could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return { error, setError, busy, run };
}

const reasonRequired = `${CORRECTION_REASON_LABEL} is required.`;

function MarkForm({ yearId, studentId, detail, online, onDone }: FormProps & { studentId: string; detail: ReportCardIssueDetail }) {
  const subjects = detail.payload.subjects;
  const [subjectId, setSubjectId] = useState(subjects[0]?.subjectId ?? '');
  // Only periods the student was graded in (null cells are "not enrolled").
  const periods = detail.payload.columns.filter(
    (c) => c.kind === 'PERIOD' && c.gradingPeriodId
      && subjects.find((s) => s.subjectId === subjectId)?.cells[c.key]?.value != null,
  );
  const [chosenPeriod, setPeriodId] = useState('');
  const periodId = periods.some((p) => p.gradingPeriodId === chosenPeriod)
    ? chosenPeriod
    : (periods[0]?.gradingPeriodId ?? '');
  const [score, setScore] = useState('');
  const [reason, setReason] = useState('');
  const { error, setError, busy, run } = useSubmit(onDone, 'Mark corrected.');

  const submit = () => {
    const value = Number(score);
    if (periodId === '') {
      setError('This subject has no graded period to correct.');
      return;
    }
    if (score.trim() === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      setError('Enter a score from 0 to 100.');
      return;
    }
    if (reason.trim() === '') {
      setError(reasonRequired);
      return;
    }
    void run(async () => {
      const result = await academicYearCloseBridge.correctGrade({
        yearId, studentId, subjectId, gradingPeriodId: periodId, score: value, reason: reason.trim(),
      });
      setScore('');
      setReason('');
      return result;
    });
  };

  return (
    <section aria-label="Correct a mark" className="space-y-3 rounded-card border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Correct a mark</h3>
      <label className="block text-sm text-slate-700">
        Subject
        <select className={inputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.name}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-700">
        Period
        <select className={inputClass} value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          {periods.map((p) => <option key={p.key} value={p.gradingPeriodId ?? ''}>{p.label}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-700">
        New score
        <input className={inputClass} inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} />
      </label>
      <ReasonField value={reason} onChange={setReason} />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button disabled={busy || !online} onClick={submit}>Correct mark</Button>
    </section>
  );
}

function OutcomeForm({ yearId, student, online, onDone }: FormProps & { student: PromotionStudent }) {
  const choices = outcomesFor(student.gradeLevel);
  const [outcome, setOutcome] = useState<CompletionOutcome>(student.decision?.outcome ?? student.suggestion ?? choices[0]!);
  const [reason, setReason] = useState('');
  const { error, setError, busy, run } = useSubmit(onDone, 'Outcome changed.');
  const next = nextGradeFor(student.gradeLevel, outcome);

  const submit = () => {
    if (reason.trim() === '') {
      setError(reasonRequired);
      return;
    }
    void run(async () => {
      const result = await academicYearCloseBridge.correctOutcome({
        yearId, studentId: student.studentId, outcome, nextGradeLevel: next, reason: reason.trim(),
      });
      setReason('');
      return result;
    });
  };

  return (
    <section aria-label="Change outcome" className="space-y-3 rounded-card border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Change outcome</h3>
      <label className="block text-sm text-slate-700">
        Outcome
        <select className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value as CompletionOutcome)}>
          {choices.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
        </select>
      </label>
      <p className="text-sm text-slate-700">Next grade: {next ? gradeLabel(next) : '—'}</p>
      <ReasonField value={reason} onChange={setReason} />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button disabled={busy || !online} onClick={submit}>Change outcome</Button>
    </section>
  );
}

function RemarkForm({ yearId, student, detail, online, onDone }: FormProps & { student: PromotionStudent; detail: ReportCardIssueDetail }) {
  const [remark, setRemark] = useState(detail.payload.principalRemark ?? '');
  const [reason, setReason] = useState('');
  const { error, setError, busy, run } = useSubmit(onDone, 'Remark updated.');

  const submit = () => {
    if (remark.trim() === '') {
      setError('Enter the remark.');
      return;
    }
    if (reason.trim() === '') {
      setError(reasonRequired);
      return;
    }
    void run(async () => {
      const result = await academicYearCloseBridge.correctRemark({
        yearId, studentId: student.studentId, remark: remark.trim(), reason: reason.trim(),
      });
      setReason('');
      return result;
    });
  };

  return (
    <section aria-label="Edit remark" className="space-y-3 rounded-card border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Edit remark</h3>
      <label className="block text-sm text-slate-700">
        Principal remark
        <textarea className={inputClass} rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} />
      </label>
      <ReasonField value={reason} onChange={setReason} />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button disabled={busy || !online} onClick={submit}>Save remark</Button>
    </section>
  );
}
