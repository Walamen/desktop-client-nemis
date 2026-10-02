'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GradeLevel, RegistryHit } from '@nemis-desktop/types';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { registryBridge, parseIpcError } from '@/services/nemis-bridge/school-admin/registry-bridge';
import { grades, human } from '../shared';
import { ClassTermPicker, isClassTermComplete, type ClassTermValue } from './ClassTermPicker';
import { claimGradeDefault, claimNeedsReason, describeCompletion } from './wizard-logic';

/** An IMMEDIATE hit: the student is free to be claimed into this school. The
 * grade defaults to the stamp's next grade; any other grade (or no stamp, or
 * GRADUATED) needs a reason the server records. */
export function ClaimStudentPanel({
  hit,
  dateOfBirth,
  onBack,
}: {
  hit: RegistryHit;
  dateOfBirth: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [grade, setGrade] = useState<GradeLevel | ''>(claimGradeDefault(hit));
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<ClassTermValue>({ academicYearId: '', classId: '', termId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const needsReason = claimNeedsReason(hit, grade);
  const completion = describeCompletion(hit);
  const ready = Boolean(grade) && isClassTermComplete(target) && (!needsReason || reason.trim().length > 0);

  const claim = async () => {
    if (!grade) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await registryBridge.claimStudent({
        nemisId: hit.nemisId,
        dateOfBirth,
        classId: target.classId,
        termId: target.termId,
        gradeLevel: grade,
        overrideReason: needsReason ? reason.trim() : undefined,
      });
      if (result.refreshed) router.push(`/government/school-admin/students/profile?id=${result.data.studentId}`);
      else setPendingSync(true);
    } catch (cause) {
      setError(parseIpcError(cause)?.message ?? 'The claim could not be completed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingSync) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
        <p className="text-sm text-green-800">Claimed. The student will appear once this device syncs.</p>
        <Button type="button" variant="secondary" onClick={() => router.push('/government/school-admin/students')}>
          Back to students list
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Claim student</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-gray-600">Name</dt>
          <dd className="font-medium">
            {hit.firstName} {hit.lastName}
          </dd>
        </div>
        <div>
          <dt className="text-gray-600">Gender</dt>
          <dd className="font-medium">{human(hit.gender)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-gray-600">Last completed</dt>
          <dd className="font-medium">{completion ?? 'No outcome recorded'}</dd>
        </div>
      </dl>
      <Select
        label="Grade"
        required
        placeholder="Select grade"
        options={grades.map((g) => ({ value: g, label: human(g) }))}
        value={grade}
        onChange={(e) => setGrade(e.target.value as GradeLevel)}
      />
      {needsReason && (
        <Input label="Reason for the grade" required value={reason} onChange={(e) => setReason(e.target.value)} />
      )}
      <ClassTermPicker gradeLevel={grade} value={target} onChange={setTarget} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-between">
        <Button type="button" variant="secondary" disabled={submitting} onClick={onBack}>
          Back to search
        </Button>
        <Button type="button" disabled={!ready || submitting} onClick={() => void claim()}>
          {submitting ? 'Claiming…' : 'Claim student'}
        </Button>
      </div>
    </div>
  );
}
