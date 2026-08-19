'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DOMPurify from 'dompurify';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { Alert, Badge, Input, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useAssignmentsViewModel } from '@/lib/presentation/hooks/teacher';
import { assignmentBridge } from '@/services/nemis-bridge/teacher/assignment-bridge';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

const BADGE_VARIANT: Record<string, 'neutral' | 'primary' | 'success' | 'warning'> = {
  Pending: 'neutral',
  Submitted: 'primary',
  Graded: 'success',
  Late: 'warning',
};

export function SubmissionDetailPage({ assignmentId, studentId }: { assignmentId: string; studentId: string }) {
  const currentUser = useCurrentUserViewModel();
  const assignmentsVm = useAssignmentsViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const detail = useViewModel(assignmentsVm.store, (s) => s.detail);
  const submissions = useViewModel(assignmentsVm.store, (s) => s.submissions);

  const teacherId = user.status === 'success' ? user.data.id : undefined;

  useRevalidateOnSync(() => {
    if (!teacherId) return;
    void assignmentsVm.loadAssignment(assignmentId, teacherId);
    void assignmentsVm.loadSubmissions(assignmentId, teacherId);
  }, [teacherId, assignmentId, assignmentsVm]);

  const hasSubmissions = submissions.status === 'success' || submissions.status === 'refreshing';
  const submission = hasSubmissions ? submissions.data.find((s) => s.studentId === studentId) : undefined;

  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [dirty, setDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (submission && !initialized) {
      setGrade(submission.grade?.toString() ?? '');
      setFeedback(submission.feedback ?? '');
      setInitialized(true);
    }
  }, [submission, initialized]);

  async function handleGrade() {
    if (!teacherId) return;
    const gradeNum = Number(grade);
    if (Number.isNaN(gradeNum) || gradeNum < 0) {
      setError('Please enter a valid grade.');
      return;
    }
    setError('');
    setSaving(true);
    const outcome = await assignmentsVm.gradeSubmission({
      assignmentId,
      studentId,
      teacherId,
      grade: gradeNum,
      feedback: feedback || undefined,
    });
    setSaving(false);
    if (outcome.ok) setDirty(false);
    else setError(outcome.error.userMessage);
  }

  if (detail.status === 'loading' || !hasSubmissions) {
    return (
      <div className="p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (detail.status !== 'success') {
    return <Alert variant="error">Assignment not found or failed to load.</Alert>;
  }
  if (!submission) {
    return (
      <div className="space-y-4 p-6">
        <Link
          href={`/government/teacher/assignment/detail?id=${assignmentId}`}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Assignment
        </Link>
        <Alert variant="error">Student submission not found.</Alert>
      </div>
    );
  }

  const a = detail.data;
  const canGrade = submission.status.label !== 'Pending';

  return (
    <div className="px-4 py-6 space-y-6 max-w-3xl">
      <Link
        href={`/government/teacher/assignment/detail?id=${assignmentId}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Assignment
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-primary">{submission.studentName}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{submission.admissionNumber}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {submission.submittedAt && <p className="text-xs text-gray-400">Submitted {submission.submittedAt}</p>}
          <Badge size="sm" variant={BADGE_VARIANT[submission.status.label] ?? 'neutral'}>
            {submission.status.label}
          </Badge>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Assignment</h2>
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-5 space-y-4">
          <h3 className="font-semibold text-primary text-base">{a.title}</h3>
          {a.instructions ? (
            <div
              className="prose prose-sm max-w-none prose-headings:text-primary prose-a:text-secondary"
              dangerouslySetInnerHTML={{
                __html: typeof window !== 'undefined' ? DOMPurify.sanitize(a.instructions) : a.instructions,
              }}
            />
          ) : (
            <p className="text-sm text-gray-400 italic">No written instructions provided.</p>
          )}
          {a.attachmentUrl && (
            <button
              type="button"
              onClick={() => void assignmentBridge.openAssignmentAttachment(a.attachmentUrl!)}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-secondary hover:bg-gray-50 transition-colors"
            >
              <Paperclip className="w-4 h-4" />
              {a.attachmentName ?? 'Open attachment'}
            </button>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Student Response</h2>
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-5 space-y-4">
          {submission.status.label === 'Pending' ? (
            <p className="text-sm text-gray-400 italic">No response submitted yet.</p>
          ) : submission.response ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{submission.response}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">No text response provided.</p>
          )}
        </div>
      </section>

      {canGrade && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Grade &amp; Feedback</h2>
          <div className="bg-white border border-gray-200 rounded-lg px-6 py-5 space-y-4">
            {error && <p className="text-xs text-error">{error}</p>}
            <div className="flex items-start gap-6">
              <div className="w-24">
                <Input
                  label={`Grade${a.totalMarks != null ? ` (out of ${a.totalMarks})` : ''}`}
                  type="number"
                  min="0"
                  max={a.totalMarks}
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value);
                    setDirty(true);
                  }}
                  className="text-center"
                  placeholder="—"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-gray-500">Feedback</label>
                <textarea
                  value={feedback}
                  onChange={(e) => {
                    setFeedback(e.target.value);
                    setDirty(true);
                  }}
                  rows={3}
                  placeholder="Write feedback for the student…"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-secondary focus:border-secondary resize-none"
                />
              </div>
            </div>
            {dirty && (
              <button
                type="button"
                onClick={() => void handleGrade()}
                disabled={saving}
                className="px-4 py-2 bg-secondary text-white rounded-lg text-sm font-semibold hover:bg-secondary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Grade'}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
