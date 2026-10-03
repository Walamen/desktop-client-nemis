'use client';
import { useState, type ReactNode } from 'react';
import type { GradeLevel } from '@nemis-desktop/types';
import { Button, Input, Select, Textarea } from '@nemis-desktop/ui';
import type { LocalTransfer } from '@/lib/transfers';
import { needsPlacement } from '@/lib/transfers';
import { transferBridge } from '@/services/nemis-bridge/school-admin/transfer-bridge';
import { registryBridge } from '@/services/nemis-bridge/school-admin/registry-bridge';
import { grades, human } from '../students/shared';
import { ClassTermPicker, isClassTermComplete, type ClassTermValue } from '../students/add-student/ClassTermPicker';
import { useTransferCommand } from './use-transfer-command';

const EMPTY_TARGET: ClassTermValue = { academicYearId: '', classId: '', termId: '' };
const RETRY = 'The transfer could not be updated. Please try again.';

interface FormProps {
  row: LocalTransfer;
  online: boolean;
  onClose: () => void;
  onDone: (refreshed: boolean) => void;
}

function FormShell({
  children,
  error,
  submitting,
  ready,
  submitLabel,
  onSubmit,
  onClose,
}: {
  children?: ReactNode;
  error: string | null;
  submitting: boolean;
  ready: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {children}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
          Close
        </Button>
        <Button type="button" disabled={!ready || submitting} onClick={onSubmit}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Textarea
      label="Notes (optional)"
      aria-label="Review notes"
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** The row's grade when stored; otherwise a select. */
function GradeField({
  stored,
  value,
  onChange,
}: {
  stored: string | null;
  value: GradeLevel | '';
  onChange: (g: GradeLevel) => void;
}) {
  if (stored) return <p className="text-sm text-slate-600">Grade: {human(stored)}</p>;
  return (
    <Select
      label="Grade"
      required
      placeholder="Select grade"
      options={grades.map((g) => ({ value: g, label: human(g) }))}
      value={value}
      onChange={(e) => onChange(e.target.value as GradeLevel)}
    />
  );
}

const withNotes = (notes: string) => (notes.trim() ? { reviewNotes: notes.trim() } : {});

/** Approve a push sent to us. Class and term are asked only when the row has
 * none stored; the server prefers stored ones (portal-web's rule). */
export function ApproveForm({ row, online, onClose, onDone }: FormProps) {
  const placement = needsPlacement(row);
  const [grade, setGrade] = useState<GradeLevel | ''>((row.toGradeLevel as GradeLevel | null) ?? '');
  const [target, setTarget] = useState<ClassTermValue>(EMPTY_TARGET);
  const [notes, setNotes] = useState('');
  const { submitting, error, run } = useTransferCommand(onDone, RETRY);
  const ready = online && (!placement || (Boolean(grade) && isClassTermComplete(target)));

  const submit = () =>
    void run(() =>
      transferBridge.reviewTransfer({
        id: row.id,
        status: 'APPROVED',
        ...withNotes(notes),
        ...(placement ? { classId: target.classId, termId: target.termId } : {}),
      }),
    );

  return (
    <FormShell
      error={error}
      submitting={submitting}
      ready={ready}
      submitLabel="Confirm approval"
      onSubmit={submit}
      onClose={onClose}
    >
      {placement && (
        <>
          <p className="text-sm text-slate-700">Choose the class and term this student joins.</p>
          <GradeField
            stored={row.toGradeLevel}
            value={grade}
            onChange={(g) => {
              // A class belongs to one grade; the term is kept.
              setGrade(g);
              setTarget((t) => ({ ...t, classId: '' }));
            }}
          />
          <ClassTermPicker gradeLevel={grade} value={target} onChange={setTarget} />
        </>
      )}
      <NotesField value={notes} onChange={setNotes} />
    </FormShell>
  );
}

/** Reject never needs a placement. */
export function RejectForm({ row, online, onClose, onDone }: FormProps) {
  const [notes, setNotes] = useState('');
  const { submitting, error, run } = useTransferCommand(onDone, RETRY);
  const submit = () =>
    void run(() => transferBridge.reviewTransfer({ id: row.id, status: 'REJECTED', ...withNotes(notes) }));
  return (
    <FormShell
      error={error}
      submitting={submitting}
      ready={online}
      submitLabel="Confirm rejection"
      onSubmit={submit}
      onClose={onClose}
    >
      <NotesField value={notes} onChange={setNotes} />
    </FormShell>
  );
}

/** Release, Cancel and Withdraw: one confirmation, no inputs. Release sends
 * no placement — the requester already chose class and term. */
export function ConfirmForm({
  row,
  online,
  onClose,
  onDone,
  kind,
  otherSchool,
  studentLabel,
}: FormProps & { kind: 'release' | 'cancel' | 'withdraw'; otherSchool: string; studentLabel: string }) {
  const { submitting, error, run } = useTransferCommand(onDone, RETRY);
  const copy = {
    release: { text: `Release ${studentLabel} to ${otherSchool}?`, label: 'Confirm release' },
    cancel: { text: `Cancel this transfer request for ${studentLabel}?`, label: 'Confirm cancellation' },
    withdraw: { text: `Withdraw this transfer request for ${studentLabel}?`, label: 'Confirm withdrawal' },
  }[kind];
  const submit = () =>
    void run(() =>
      kind === 'release'
        ? transferBridge.reviewTransfer({ id: row.id, status: 'APPROVED' })
        : transferBridge.cancelTransfer(row.id),
    );
  return (
    <FormShell
      error={error}
      submitting={submitting}
      ready={online}
      submitLabel={copy.label}
      onSubmit={submit}
      onClose={onClose}
    >
      <p className="text-sm text-slate-700">{copy.text}</p>
    </FormShell>
  );
}

/** Complete a lapsed pull by claiming the child. The date of birth is asked
 * again: the child is still at the other school, so it is not on this device. */
export function CompleteForm({ row, online, onClose, onDone }: FormProps) {
  const hasStored = Boolean(row.classId && row.termId);
  const [useStored, setUseStored] = useState(hasStored);
  const [dob, setDob] = useState('');
  const [grade, setGrade] = useState<GradeLevel | ''>((row.toGradeLevel as GradeLevel | null) ?? '');
  const [target, setTarget] = useState<ClassTermValue>(EMPTY_TARGET);
  const { submitting, error, run } = useTransferCommand(
    onDone,
    'The transfer could not be completed. Please try again.',
  );
  const placementReady = useStored || isClassTermComplete(target);
  const ready = online && Boolean(row.studentNemisId) && Boolean(dob) && Boolean(grade) && placementReady;

  const submit = () => {
    const nemisId = row.studentNemisId;
    if (!nemisId || !grade) return;
    const classId = useStored ? (row.classId ?? '') : target.classId;
    const termId = useStored ? (row.termId ?? '') : target.termId;
    void run(() => registryBridge.claimStudent({ nemisId, dateOfBirth: dob, classId, termId, gradeLevel: grade }));
  };

  return (
    <FormShell
      error={error}
      submitting={submitting}
      ready={ready}
      submitLabel="Confirm completion"
      onSubmit={submit}
      onClose={onClose}
    >
      <Input
        label="Child's date of birth"
        aria-label="Date of birth"
        type="date"
        required
        value={dob}
        onChange={(e) => setDob(e.target.value)}
      />
      <GradeField
        stored={row.toGradeLevel}
        value={grade}
        onChange={(g) => {
          setGrade(g);
          setTarget((t) => ({ ...t, classId: '' }));
        }}
      />
      {useStored ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Using the class and term chosen when this request was made.</p>
          <Button type="button" variant="secondary" disabled={submitting} onClick={() => setUseStored(false)}>
            Choose another class and term
          </Button>
        </div>
      ) : (
        <ClassTermPicker gradeLevel={grade} value={target} onChange={setTarget} />
      )}
    </FormShell>
  );
}
