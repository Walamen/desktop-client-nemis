'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CarryOverMatching, GradeLevel, TransferMatchingRows, TransferRecordPreview } from '@nemis-desktop/types';
import { Button, ErrorState, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { needsPlacement, notifyTransfersChanged, toLocalTransfer, type LocalTransfer } from '@/lib/transfers';
import { transferBridge } from '@/services/nemis-bridge/school-admin/transfer-bridge';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { ReportCardView } from '../report-cards/ReportCardView';
import { human } from '../students/shared';
import { isClassTermComplete, type ClassTermValue } from '../students/add-student/ClassTermPicker';
import { MatchingFields } from './MatchingFields';
import { EMPTY_TARGET, NotesField, PlacementFields, RejectForm, withNotes } from './TransferActionForms';

const queryId = () =>
  typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('id') ?? '');

const INBOX = '/government/school-admin/students/inter-school-transfer';
const BROUGHT_OVER = 'Approved. The record has been brought over.';
const NOT_BROUGHT_OVER =
  "Approved. The record could not be brought over automatically — match it from the student's profile.";
const RETRY = 'The transfer could not be updated. Please try again.';

type Step = 1 | 2 | 3;
const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: '1. Record' },
  { step: 2, label: '2. Match' },
  { step: 3, label: '3. Decide' },
];

const day = (iso: string) => iso.slice(0, 10);

/** The review's `matching` and a draft-save body are arrays (every source
 * once); the preview and the form hold the record form. */
function toRows(preview: TransferRecordPreview, m: CarryOverMatching): TransferMatchingRows {
  return {
    periods: preview.matching.sourcePeriods.map((p) => ({
      sourceGradingPeriodId: p.id,
      targetGradingPeriodId: m.periods[p.id] || null,
    })),
    subjects: preview.matching.sourceSubjects.map((s) => ({
      sourceSubjectId: s.id,
      targetSubjectId: m.subjects[s.id] || null,
    })),
  };
}

/** What the matching will carry: a cell counts when both its period and its
 * subject are matched; attendance comes over when any period is matched. */
function summarise(preview: TransferRecordPreview, m: CarryOverMatching) {
  const marks = preview.sourceCells.filter((c) => m.periods[c.gradingPeriodId] && m.subjects[c.subjectId]).length;
  const anyPeriod = Object.values(m.periods).some(Boolean);
  return { marks, attendancePeriods: anyPeriod ? preview.attendance.length : 0 };
}

/** The receiving school looks over the child's current-year record at the
 * old school, optionally matches it to its own columns, then decides. Online
 * only: the record lives on the server. */
export function ReviewTransferPage() {
  const id = queryId();
  const connectivity = useConnectivityStore();
  const isOnline = useViewModel(connectivity.store, (s) => s.isOnline);
  const [preview, setPreview] = useState<TransferRecordPreview | null>(null);
  const [row, setRow] = useState<LocalTransfer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [matching, setMatching] = useState<CarryOverMatching>({ periods: {}, subjects: {} });
  const [skipped, setSkipped] = useState(false);
  const [grade, setGrade] = useState<GradeLevel | ''>('');
  const [target, setTarget] = useState<ClassTermValue>(EMPTY_TARGET);
  const [notes, setNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    if (!isOnline || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await transferBridge.getRecordPreview(id);
        if (cancelled) return;
        let found: LocalTransfer | null = null;
        if (p.initiatedBy === 'ORIGIN_SCHOOL') {
          try {
            const list = await sharedBridge.listSchoolAdminRecords({ collection: 'student_transfers', limit: 250 });
            found = list.items.map(toLocalTransfer).find((r) => r?.id === id) ?? null;
          } catch {
            found = null;
          }
          if (cancelled) return;
        }
        setPreview(p);
        setRow(found);
        setGrade((found?.toGradeLevel as GradeLevel | null) ?? '');
        setMatching(p.draft ?? p.matching.suggestion);
        setHasDraft(p.draft !== null);
      } catch (cause) {
        if (!cancelled) setLoadError(parseIpcError(cause)?.message ?? 'The transfer record could not be loaded.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isOnline]);

  const back = (
    <Link href={INBOX} className="text-sm text-blue-700 hover:underline">
      Back to transfers
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

  const own = preview.initiatedBy === 'RECEIVING_SCHOOL';
  const placement = !own && (row === null || needsPlacement(row));
  const placementReady = !placement || (Boolean(grade) && isClassTermComplete(target));
  const summary = summarise(preview, matching);
  const name = `${preview.student.firstName} ${preview.student.lastName}`;

  const run = async (command: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await command();
    } catch (cause) {
      setError(parseIpcError(cause)?.message ?? RETRY);
    } finally {
      setBusy(false);
    }
  };

  const approve = () =>
    run(async () => {
      const result = await transferBridge.reviewTransfer({
        id: preview.transferId,
        status: 'APPROVED',
        ...withNotes(notes),
        ...(placement ? { classId: target.classId, termId: target.termId } : {}),
        ...(skipped ? {} : { matching: toRows(preview, matching) }),
      });
      setOutcome(result.data.recordBroughtOver ? BROUGHT_OVER : NOT_BROUGHT_OVER);
      notifyTransfersChanged();
    });

  const saveDraft = () =>
    run(async () => {
      await transferBridge.saveMatchingDraft({ transferId: preview.transferId, ...toRows(preview, matching) });
      setHasDraft(true);
      setOutcome(`Matching saved. It will be applied when ${preview.fromInstitutionName} approves.`);
    });

  const clearDraft = () =>
    run(async () => {
      await transferBridge.clearMatchingDraft(preview.transferId);
      setHasDraft(false);
      setOutcome('Saved matching cleared.');
    });

  const rejectButton = !own && (
    <Button type="button" variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>
      Reject
    </Button>
  );

  const header = (
    <div>
      {back}
      <h1 className="mt-2 text-xl font-semibold text-slate-900">Review transfer — {name}</h1>
      <p className="text-sm text-slate-600">
        From {preview.fromInstitutionName} · Requested {day(preview.requestedAt)} · Reason: {preview.reason}
      </p>
    </div>
  );

  if (rejecting) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-6">
        {header}
        {outcome ? (
          <p role="status" className="text-sm text-green-800">
            {outcome}
          </p>
        ) : (
          <RejectForm
            id={preview.transferId}
            online={isOnline}
            onClose={() => setRejecting(false)}
            onDone={() => {
              setOutcome('Transfer rejected.');
              notifyTransfersChanged();
            }}
          />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      {header}
      <ol className="flex gap-4 border-b border-gray-200 text-sm" aria-label="Steps">
        {STEPS.map((s) => (
          <li
            key={s.step}
            aria-current={step === s.step ? 'step' : undefined}
            className={`-mb-px border-b-2 px-1 py-2 ${
              step === s.step ? 'border-slate-900 font-semibold text-slate-900' : 'border-transparent text-slate-500'
            }`}
          >
            {s.label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <>
          <p className="text-sm text-slate-700">
            Now at {preview.fromInstitutionName}:{' '}
            {[preview.currentGradeLevel ? human(preview.currentGradeLevel) : null, preview.currentClassName]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Report cards this year</h2>
            {preview.reportCards.length === 0 ? (
              <p className="text-sm text-slate-600">No report cards issued yet this year.</p>
            ) : (
              preview.reportCards.map((c) => (
                <ReportCardView key={c.gradingPeriodId} payload={c.payload} version={c.version} />
              ))
            )}
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Attendance</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">Period</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Late</th>
                  <th>Excused</th>
                  <th>Sick</th>
                </tr>
              </thead>
              <tbody>
                {preview.attendance.map((a) => (
                  <tr key={a.gradingPeriodName} className="border-t border-gray-100">
                    <td className="py-1">{a.gradingPeriodName}</td>
                    <td>{a.present}</td>
                    <td>{a.absent}</td>
                    <td>{a.late}</td>
                    <td>{a.excused}</td>
                    <td>{a.sick}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="flex justify-end gap-2">
            {rejectButton}
            <Button type="button" onClick={() => setStep(2)}>
              Next: match the record
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <MatchingFields
            sourcePeriods={preview.matching.sourcePeriods}
            sourceSubjects={preview.matching.sourceSubjects}
            targetPeriods={preview.matching.targetPeriods}
            targetSubjects={preview.matching.targetSubjects}
            matching={matching}
            onChange={setMatching}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSkipped(true);
                setStep(3);
              }}
            >
              Skip matching
            </Button>
            <Button
              type="button"
              onClick={() => {
                setSkipped(false);
                setStep(3);
              }}
            >
              Next
            </Button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="text-sm text-slate-800">
            {skipped
              ? 'Not matched yet.'
              : `${summary.marks} marks and ${summary.attendancePeriods} attendance periods will come over.`}
          </p>
          {placement && !outcome && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <PlacementFields
                storedGrade={row?.toGradeLevel ?? null}
                grade={grade}
                onGrade={setGrade}
                target={target}
                onTarget={setTarget}
              />
            </div>
          )}
          {!own && !outcome && <NotesField value={notes} onChange={setNotes} />}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {outcome && (
            <p role="status" className="text-sm text-green-800">
              {outcome}
            </p>
          )}
          {(!outcome || own) && (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep(2)}>
                Back
              </Button>
              {own ? (
                <>
                  {hasDraft && (
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => void clearDraft()}>
                      Clear saved matching
                    </Button>
                  )}
                  <Button type="button" disabled={busy || skipped} onClick={() => void saveDraft()}>
                    Save matching
                  </Button>
                </>
              ) : (
                <>
                  {rejectButton}
                  <Button type="button" disabled={busy || !placementReady} onClick={() => void approve()}>
                    Approve
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
