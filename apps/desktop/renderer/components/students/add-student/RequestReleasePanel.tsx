'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { GradeLevel, RegistryHit } from '@nemis-desktop/types';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { registryBridge, parseIpcError } from '@/services/nemis-bridge/school-admin/registry-bridge';
import { grades, human } from '../shared';
import { ClassTermPicker, isClassTermComplete, type ClassTermValue } from './ClassTermPicker';
import { claimGradeDefault } from './wizard-logic';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A REQUIRES_APPROVAL hit: the student is still enrolled elsewhere this
 * year, so their current school must release them. That school is never
 * named here — the lookup does not disclose it. */
export function RequestReleasePanel({
  hit,
  dateOfBirth,
  onBack,
}: {
  hit: RegistryHit;
  dateOfBirth: string;
  onBack: () => void;
}) {
  const [grade, setGrade] = useState<GradeLevel | ''>(claimGradeDefault(hit));
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<ClassTermValue>({ academicYearId: '', classId: '', termId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lapsesAt, setLapsesAt] = useState<string | null | undefined>(undefined);
  const ready = Boolean(grade) && isClassTermComplete(target) && reason.trim().length > 0;

  const send = async () => {
    if (!grade) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await registryBridge.requestRelease({
        nemisId: hit.nemisId,
        dateOfBirth,
        classId: target.classId,
        termId: target.termId,
        gradeLevel: grade,
        reason: reason.trim(),
      });
      setLapsesAt(result.data.lapsesAt);
    } catch (cause) {
      setError(parseIpcError(cause)?.message ?? 'The request could not be sent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (lapsesAt !== undefined) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">Release requested</h2>
        <p className="text-sm text-slate-700">
          We&apos;ve asked the student&apos;s current school to release {hit.firstName} {hit.lastName}.
          {lapsesAt
            ? ` If they don't respond, the request lapses on ${formatDate(lapsesAt)} and you can complete the transfer then.`
            : " If they don't respond within 14 days, you can complete the transfer then."}
        </p>
        <Link href="/government/school-admin/students/inter-school-transfer">
          <Button type="button" variant="secondary">
            View transfers
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Request release</h2>
      <p className="text-sm text-slate-600">
        {hit.firstName} {hit.lastName} is still enrolled at another school this year. Their current school must
        release them.
      </p>
      <Select
        label="Grade"
        required
        placeholder="Select grade"
        options={grades.map((g) => ({ value: g, label: human(g) }))}
        value={grade}
        onChange={(e) => {
          // A class belongs to one grade; the term is kept.
          setGrade(e.target.value as GradeLevel);
          setTarget((t) => ({ ...t, classId: '' }));
        }}
      />
      <ClassTermPicker gradeLevel={grade} value={target} onChange={setTarget} />
      <Input label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-between">
        <Button type="button" variant="secondary" disabled={submitting} onClick={onBack}>
          Back to search
        </Button>
        <Button type="button" disabled={!ready || submitting} onClick={() => void send()}>
          {submitting ? 'Sending…' : 'Send request'}
        </Button>
      </div>
    </div>
  );
}
