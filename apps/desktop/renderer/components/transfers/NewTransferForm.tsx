'use client';
import { useState } from 'react';
import type { GradeLevel, SchoolSearchResult, StudentListItemResult } from '@nemis-desktop/types';
import { formatNemisId } from '@nemis-desktop/shared';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { studentBridge } from '@/services/nemis-bridge/school-admin/student-bridge';
import { transferBridge } from '@/services/nemis-bridge/school-admin/transfer-bridge';
import { grades, human } from '../students/shared';
import { useTransferCommand } from './use-transfer-command';

const MIN_SCHOOL_QUERY = 2;

/** Send one of our students to another school: pick a local student, find the
 * destination online (never our own school), give a reason and optionally a grade. */
export function NewTransferForm({
  us,
  online,
  onClose,
  onDone,
}: {
  us: string;
  online: boolean;
  onClose: () => void;
  onDone: (refreshed: boolean) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [students, setStudents] = useState<readonly StudentListItemResult[] | null>(null);
  const [studentId, setStudentId] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schools, setSchools] = useState<SchoolSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState('');
  const [reason, setReason] = useState('');
  const [grade, setGrade] = useState<GradeLevel | ''>('');
  const { submitting, error, run } = useTransferCommand(
    onDone,
    'The transfer request could not be sent. Please try again.',
  );

  const findStudents = async () => {
    setSearchError(null);
    try {
      const result = await studentBridge.listStudents({ keyword: keyword.trim(), limit: 20 });
      setStudents(result.items);
      setStudentId('');
    } catch {
      setSearchError("Couldn't load students. Please try again.");
    }
  };

  const canSearchSchools = online && !searching && schoolQuery.trim().length >= MIN_SCHOOL_QUERY;
  const searchSchools = async () => {
    if (!canSearchSchools) return;
    setSearching(true);
    setSearchError(null);
    try {
      const found = await transferBridge.searchSchools(schoolQuery.trim());
      setSchools(found.filter((s) => s.id !== us));
      setSchoolId('');
    } catch (cause) {
      setSearchError(parseIpcError(cause)?.message ?? 'The school search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const ready = online && !submitting && Boolean(studentId && schoolId && reason.trim());
  const submit = () =>
    void run(() =>
      transferBridge.createTransfer({
        studentId,
        toInstitutionId: schoolId,
        reason: reason.trim(),
        ...(grade ? { toGradeLevel: grade } : {}),
      }),
    );

  return (
    <form
      aria-label="New transfer"
      className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      <h2 className="text-lg font-semibold text-slate-900">New transfer</h2>
      <div className="flex items-end gap-2">
        <Input
          label="Find a student by name or NEMIS ID"
          aria-label="Find student"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Button type="button" variant="secondary" disabled={!keyword.trim()} onClick={() => void findStudents()}>
          Find
        </Button>
      </div>
      {students !== null &&
        (students.length === 0 ? (
          <p className="text-sm text-slate-500">No students on this device match.</p>
        ) : (
          <Select
            label="Student"
            required
            placeholder="Select student"
            options={students.map((s) => ({
              value: s.id,
              label: s.nemisId ? `${s.fullName} — ${formatNemisId(s.nemisId)}` : s.fullName,
            }))}
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          />
        ))}
      <div className="flex items-end gap-2">
        <Input
          label="School name or code"
          aria-label="Search schools"
          helperText={`At least ${MIN_SCHOOL_QUERY} characters.`}
          value={schoolQuery}
          onChange={(e) => setSchoolQuery(e.target.value)}
        />
        <Button type="button" variant="secondary" disabled={!canSearchSchools} onClick={() => void searchSchools()}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </div>
      {searchError && <p className="text-sm text-red-700">{searchError}</p>}
      {schools !== null &&
        (schools.length === 0 ? (
          <p className="text-sm text-slate-500">No other schools match.</p>
        ) : (
          <Select
            label="Destination school"
            required
            placeholder="Select school"
            options={schools.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
          />
        ))}
      <Input
        label="Reason for transfer"
        aria-label="Reason"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Select
        label="Grade (optional)"
        options={[{ value: '', label: 'Not specified' }, ...grades.map((g) => ({ value: g, label: human(g) }))]}
        value={grade}
        onChange={(e) => setGrade(e.target.value as GradeLevel | '')}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
          Close
        </Button>
        <Button type="submit" disabled={!ready}>
          {submitting ? 'Sending…' : 'Send transfer request'}
        </Button>
      </div>
    </form>
  );
}
