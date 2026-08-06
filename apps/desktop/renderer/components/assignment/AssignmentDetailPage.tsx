'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DOMPurify from 'dompurify';
import { ArrowLeft, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { Alert, Badge, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useAssignmentsViewModel } from '@/lib/presentation/hooks/teacher';
import { assignmentBridge } from '@/services/nemis-bridge/teacher/assignment-bridge';
import { SubmissionsTable } from './SubmissionsTable';

const TYPE_LABELS: Record<string, string> = {
  HOMEWORK: 'Homework',
  PROJECT: 'Project',
  QUIZ: 'Quiz',
  TEST: 'Test',
  EXAM: 'Exam',
  PRESENTATION: 'Presentation',
};

/** Teacher-facing assignment detail — mirrors portal-web's
 * /government/teacher/assignment/[id]: banner with edit/delete, a Details
 * tab (instructions + metadata) and a Submissions tab (grading). */
export function AssignmentDetailPage({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const currentUser = useCurrentUserViewModel();
  const assignmentsVm = useAssignmentsViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const detail = useViewModel(assignmentsVm.store, (s) => s.detail);

  const teacherId = user.status === 'success' ? user.data.id : undefined;
  const [activeTab, setActiveTab] = useState<'details' | 'submissions'>('details');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (teacherId && assignmentId) void assignmentsVm.loadAssignment(assignmentId, teacherId);
  }, [teacherId, assignmentId, assignmentsVm]);

  useEffect(() => {
    if (detail.status !== 'error' && detail.status !== 'empty') return;
    const timer = setTimeout(() => router.push('/government/teacher/assignment'), 1500);
    return () => clearTimeout(timer);
  }, [detail.status, router]);

  async function handleDelete() {
    if (!teacherId) return;
    setDeleteError('');
    const outcome = await assignmentsVm.deleteAssignment({ id: assignmentId, teacherId });
    if (outcome.ok) {
      router.push('/government/teacher/assignment');
    } else {
      setDeleteError(outcome.error.userMessage);
      setConfirmDelete(false);
    }
  }

  if (detail.status !== 'success' && detail.status !== 'refreshing') {
    // 'empty' is structurally possible but never actually produced here —
    // GetAssignmentUseCase throws (→ 'error') rather than returning null —
    // so it's treated the same as a genuine not-found/failed load.
    if (detail.status === 'error' || detail.status === 'empty') {
      return (
        <div className="p-6 space-y-4">
          <Link
            href="/government/teacher/assignment"
            className="inline-flex items-center gap-2 text-sm text-gray-600 font-bold hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Assignments
          </Link>
          <Alert variant="error">Assignment not found or failed to load. Returning to your assignments…</Alert>
        </div>
      );
    }
    return (
      <div className="p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const a = detail.data;
  const canEdit = a.status.label === 'Draft' || a.status.label === 'Active';
  const canDelete = a.status.label === 'Draft';

  return (
    <div className="px-4 py-6 space-y-2">
      <Link
        href="/government/teacher/assignment"
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Assignments
      </Link>
      {deleteError && <Alert variant="error">{deleteError}</Alert>}

      <div className="bg-primary rounded-card p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{a.title}</h1>
            <p className="text-sm text-white/60 mt-1">
              {a.className}
              {a.subjectName ? ` · ${a.subjectName}` : ''}
              {' · Created '}
              {a.createdAt}
            </p>
            <div className="flex flex-wrap gap-6 mt-4">
              <div>
                <p className="text-xs text-white/50">Due</p>
                <p className="text-sm font-semibold">{a.dueDate}</p>
              </div>
              {a.totalMarks != null && (
                <div>
                  <p className="text-xs text-white/50">Total Marks</p>
                  <p className="text-sm font-semibold">{a.totalMarks}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-white/50">Type</p>
                <p className="text-sm font-semibold">{TYPE_LABELS[a.type] ?? a.type}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Status</p>
                <Badge
                  size="sm"
                  variant={a.status.badge === 'success' ? 'success' : a.status.badge === 'pending' ? 'warning' : 'neutral'}
                >
                  {a.status.label}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && (
              <Link
                href={`/government/teacher/assignment/edit?id=${assignmentId}`}
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-secondary hover:bg-white/20 rounded-button text-sm font-medium transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
            )}
            {canDelete &&
              (!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-full text-sm font-medium text-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              ) : (
                <button
                  onClick={() => void handleDelete()}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Confirm Delete
                </button>
              ))}
          </div>
        </div>
      </div>

      <div className="border-b-2 border-gray-200">
        <div className="flex gap-0">
          {(
            [
              { key: 'details', label: 'Assignment Details' },
              { key: 'submissions', label: `Submissions (${a.submittedCount} / ${a.totalStudents})` },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 -mb-0.5 transition-colors ${
                activeTab === key ? 'border-secondary text-secondary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'details' && (
        <div className="space-y-4">
          {a.instructions ? (
            <div
              className="prose prose-sm max-w-none prose-headings:text-primary prose-a:text-secondary bg-white border border-gray-200 rounded-lg px-6 py-5"
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
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-secondary hover:bg-gray-50 transition-colors"
            >
              <Paperclip className="w-4 h-4" />
              {a.attachmentName ?? 'Open attachment'}
            </button>
          )}
        </div>
      )}

      {activeTab === 'submissions' && <SubmissionsTable assignmentId={assignmentId} totalMarks={a.totalMarks} />}
    </div>
  );
}
