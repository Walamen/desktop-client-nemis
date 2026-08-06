'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, EmptyState, Skeleton, Spinner } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useAssignmentsViewModel } from '@/lib/presentation/hooks/teacher';

interface RowState {
  grade: string;
  feedback: string;
  dirty: boolean;
}

const BADGE_VARIANT: Record<string, 'neutral' | 'primary' | 'success' | 'warning'> = {
  Pending: 'neutral',
  Submitted: 'primary',
  Graded: 'success',
  Late: 'warning',
};

export function SubmissionsTable({ assignmentId, totalMarks }: { assignmentId: string; totalMarks?: number }) {
  const currentUser = useCurrentUserViewModel();
  const assignmentsVm = useAssignmentsViewModel();
  const user = useViewModel(currentUser.store, (s) => s.user);
  const submissions = useViewModel(assignmentsVm.store, (s) => s.submissions);
  const teacherId = user.status === 'success' ? user.data.id : undefined;

  useEffect(() => {
    if (teacherId) void assignmentsVm.loadSubmissions(assignmentId, teacherId);
  }, [teacherId, assignmentId, assignmentsVm]);

  const hasData = submissions.status === 'success' || submissions.status === 'refreshing';
  const rows = useMemo(() => (hasData ? submissions.data : []), [hasData, submissions]);

  // Lazy initial state — a local draft the teacher edits and saves one row at
  // a time, not continuously re-synced from the server (matching web's
  // SubmissionsTable). Switching away from the Submissions tab and back
  // remounts this component, which naturally refreshes it.
  const [rowState, setRowState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.studentId, { grade: r.grade?.toString() ?? '', feedback: r.feedback ?? '', dirty: false }])),
  );
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && hasData) {
      setRowState(
        Object.fromEntries(rows.map((r) => [r.studentId, { grade: r.grade?.toString() ?? '', feedback: r.feedback ?? '', dirty: false }])),
      );
      setSeeded(true);
    }
  }, [seeded, hasData, rows]);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  function updateRow(studentId: string, field: 'grade' | 'feedback', value: string) {
    setRowState((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] ?? { grade: '', feedback: '', dirty: false }), [field]: value, dirty: true } }));
  }

  async function save(studentId: string) {
    if (!teacherId) return;
    const row = rowState[studentId];
    if (!row?.dirty) return;
    const gradeNum = Number(row.grade);
    if (Number.isNaN(gradeNum) || gradeNum < 0) {
      setError('Please enter a valid grade.');
      return;
    }
    setError('');
    setSavingId(studentId);
    const outcome = await assignmentsVm.gradeSubmission({
      assignmentId,
      studentId,
      teacherId,
      grade: gradeNum,
      feedback: row.feedback || undefined,
    });
    setSavingId(null);
    if (outcome.ok) {
      setRowState((prev) => ({ ...prev, [studentId]: { ...prev[studentId]!, dirty: false } }));
    } else {
      setError(outcome.error.userMessage);
    }
  }

  if (!hasData) return <Skeleton className="h-56 w-full" />;
  if (rows.length === 0) {
    return <EmptyState title="No enrolled students" description="Enroll students in this class to collect submissions." />;
  }

  const submitted = rows.filter((r) => r.status.label !== 'Pending').length;
  const pct = rows.length > 0 ? Math.round((submitted / rows.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-secondary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm text-gray-600 whitespace-nowrap">
          {submitted} of {rows.length} submitted ({pct}%)
        </span>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full bg-white">
          <thead className="bg-secondary/20">
            <tr>
              {['#', 'Student', 'Submitted', 'Status', 'Response', 'Grade', 'Feedback', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-sm font-bold text-slate-600 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((s, idx) => {
              const row = rowState[s.studentId] ?? { grade: '', feedback: '', dirty: false };
              const canGrade = s.status.label !== 'Pending';
              const isSaving = savingId === s.studentId;
              return (
                <tr key={s.studentId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-slate-600">{s.studentName}</p>
                    <p className="text-xs text-gray-400">{s.admissionNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{s.submittedAt ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge size="sm" variant={BADGE_VARIANT[s.status.label] ?? 'neutral'}>
                      {s.status.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {s.status.label === 'Pending' ? (
                      <span className="text-gray-300 text-sm">—</span>
                    ) : (
                      <Link
                        href={`/government/teacher/assignment/submission?assignmentId=${assignmentId}&studentId=${s.studentId}`}
                        className="text-sm font-medium text-secondary hover:underline"
                      >
                        View
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max={totalMarks}
                        value={row.grade}
                        onChange={(e) => updateRow(s.studentId, 'grade', e.target.value)}
                        disabled={!canGrade}
                        className="w-14 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-secondary focus:border-secondary disabled:bg-gray-100 disabled:text-gray-400"
                        placeholder="—"
                      />
                      {totalMarks != null && <span className="text-xs text-gray-400">/ {totalMarks}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={row.feedback}
                      onChange={(e) => updateRow(s.studentId, 'feedback', e.target.value)}
                      disabled={!canGrade}
                      placeholder={canGrade ? 'Add feedback…' : 'Not submitted'}
                      className="w-44 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-secondary focus:border-secondary disabled:bg-gray-100 disabled:text-gray-400 disabled:placeholder-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {canGrade && row.dirty ? (
                      <button
                        type="button"
                        onClick={() => void save(s.studentId)}
                        disabled={isSaving}
                        className="text-sm font-semibold text-secondary hover:text-secondary/80 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        {isSaving ? <Spinner size="sm" /> : null}
                        Save
                      </button>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
