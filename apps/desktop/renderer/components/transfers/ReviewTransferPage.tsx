'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CarryOverMatching, GradeLevel, TransferMatchingRows, TransferRecordPreview } from '@nemis-desktop/types';
import { Button, Skeleton } from '@nemis-desktop/ui';
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
const SYNC_NOTE = 'Saved — this will appear once this device syncs.';
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

/** What the server carries once a matching is sent: every published mark
 * (matched ones into columns, the rest under "Earned at <School>"), every
 * forwarded row, and every attendance period, whatever the matching. */
function summarise(preview: TransferRecordPreview) {
  return { marks: preview.sourceCells.length + preview.forwardedCount, attendancePeriods: preview.attendance.length };
}

async function findLocalRow(id: string): Promise<LocalTransfer | null> {
  try {
    const list = await sharedBridge.listSchoolAdminRecords({ collection: 'student_transfers', limit: 250 });
    return list.items.map(toLocalTransfer).find((r) => r?.id === id) ?? null;
  } catch {
    return null;
  }
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
  const [syncPending, setSyncPending] = useState(false);
  // Set when the preview was refused: the local row says whether this school can still reject.
  const [refusedRow, setRefusedRow] = useState<LocalTransfer | null>(null);
  // The matching and grade are seeded once; a reload (the connection coming back) keeps the admin's edits.
  const seeded = useRef(false);

  useEffect(() => {
    if (!isOnline || !id) return;
    let cancelled = false;
    setLoadError(null);
    setRefusedRow(null);
    (async () => {
      try {
        const p = await transferBridge.getRecordPreview(id);
        if (cancelled) return;
        const found = p.initiatedBy === 'ORIGIN_SCHOOL' ? await findLocalRow(id) : null;
        if (cancelled) return;
        setPreview(p);
        setRow(found);
        if (!seeded.current) {
          seeded.current = true;
          setGrade((found?.toGradeLevel as GradeLevel | null) ?? '');
          setMatching(p.draft ?? p.matching.suggestion);
        }
        setHasDraft(p.draft !== null);
      } catch (cause) {
        if (cancelled) return;
        const localRow = await findLocalRow(id);
        if (cancelled) return;
        setRefusedRow(localRow);
        setLoadError(parseIpcError(cause)?.message ?? 'The transfer record could not be loaded.');
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
  if (loadError) {
    // A refused preview still lets the admin go back, and reject a request
    // this school decides and that is still pending.
    const canReject = refusedRow?.status === 'PENDING' && refusedRow.initiatedBy === 'ORIGIN_SCHOOL';
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-6">
        {back}
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          Review transfer{refusedRow?.studentName ? ` — ${refusedRow.studentName}` : ''}
        </h1>
        <p role="alert" className="text-sm text-red-700">
          {loadError}
        </p>
        {canReject && !outcome && (
          <RejectForm
            id={id}
            online={isOnline}
            onClose={() => undefined}
            onDone={(refreshed) => {
              setOutcome('Transfer rejected.');
              setSyncPending(!refreshed);
              notifyTransfersChanged();
            }}
          />
        )}
        {outcome && (
          <p role="status" className="text-sm text-green-800">
            {outcome}
          </p>
        )}
        {outcome && syncPending && <p className="text-sm text-green-800">{SYNC_NOTE}</p>}
      </main>
    );
  }
  if (!preview) return <Skeleton className="m-6 h-40" />;

  const own = preview.initiatedBy === 'RECEIVING_SCHOOL';
  const placement = !own && (row === null || needsPlacement(row));
  const placementReady = !placement || (Boolean(grade) && isClassTermComplete(target));
  const summary = summarise(preview);
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
      setSyncPending(!result.refreshed);
      notifyTransfersChanged();
    });

  const saveDraft = () =>
    run(async () => {
      const result = await transferBridge.saveMatchingDraft({
        transferId: preview.transferId,
        ...toRows(preview, matching),
      });
      setSyncPending(!result.refreshed);
      setHasDraft(true);
      setOutcome(`Matching saved. It will be applied when ${preview.fromInstitutionName} approves.`);
    });

  const clearDraft = () =>
    run(async () => {
      const result = await transferBridge.clearMatchingDraft(preview.transferId);
      setSyncPending(!result.refreshed);
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
          <>
            <p role="status" className="text-sm text-green-800">
              {outcome}
            </p>
            {syncPending && <p className="text-sm text-green-800">{SYNC_NOTE}</p>}
          </>
        ) : (
          <RejectForm
            id={preview.transferId}
            online={isOnline}
            onClose={() => setRejecting(false)}
            onDone={(refreshed) => {
              setSyncPending(!refreshed);
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
          {outcome && syncPending && <p className="text-sm text-green-800">{SYNC_NOTE}</p>}
          {(!outcome || own) && (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setOutcome(null);
                  setError(null);
                  setStep(2);
                }}
              >
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
