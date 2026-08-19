'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Plus } from 'lucide-react';
import { AssignmentStatus } from '@nemis-desktop/types';
import { Badge, EmptyState, ErrorState, Select, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useTeachingAssignmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { useAssignmentsViewModel } from '@/lib/presentation/hooks/teacher';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { DatabaseUnavailablePanel } from '@/components/dashboard/DatabaseUnavailablePanel';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { groupClassesWithSubjects } from './shared';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: AssignmentStatus.DRAFT, label: 'Draft' },
  { value: AssignmentStatus.ACTIVE, label: 'Active' },
  { value: AssignmentStatus.CLOSED, label: 'Closed' },
];

/** Teacher-facing assignment list — mirrors portal-web's
 * /government/teacher/assignment (stats row, class/status/subject filters,
 * table), built over the desktop's own hexagonal assignment vertical. */
export function AssignmentListPage() {
  const currentUser = useCurrentUserViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();
  const assignmentsVm = useAssignmentsViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const teachingRows = useViewModel(teachingAssignments.store, (s) => s.assignments);
  const list = useViewModel(assignmentsVm.store, (s) => s.list);

  const teacherId = user.status === 'success' ? user.data.id : undefined;

  // The signed-in identity (`teacherId`, the `users` table) and the id every
  // teaching-assignment record is keyed by (`staff.id`) are different id
  // spaces — `staff.userId` is the (unique) bridge between them. Mirrors
  // government/teacher/page.tsx. `teacherId` itself stays in use for the
  // assignment calls below, whose ownership is re-injected server-side from
  // the caller's own staff id regardless of what's sent (see
  // handlers/teacher/assignments.ts), so the mismatch is harmless there.
  const [staffId, setStaffId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!teacherId) return;
    let cancelled = false;
    void sharedBridge.listSchoolAdminRecords({ collection: 'staff', limit: 250 }).then((result) => {
      if (cancelled) return;
      const mine = result.items.find((r) => r.userId === teacherId);
      setStaffId(mine ? String(mine.id) : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState<AssignmentStatus | ''>('');
  const [subjectId, setSubjectId] = useState('');

  useRevalidateOnSync(() => {
    if (staffId) void teachingAssignments.load(staffId);
  }, [staffId, teachingAssignments]);

  useRevalidateOnSync(() => {
    if (!teacherId) return;
    assignmentsVm.setFilters({ classId: classId || undefined, status: status || undefined });
    void assignmentsVm.loadAssignments(teacherId);
  }, [teacherId, classId, status, assignmentsVm]);

  const hasTeachingData = teachingRows.status === 'success' || teachingRows.status === 'refreshing';
  const myClasses = useMemo(
    () => (hasTeachingData ? groupClassesWithSubjects(teachingRows.data) : []),
    [hasTeachingData, teachingRows],
  );
  const subjectOptions = myClasses.find((c) => c.classId === classId)?.subjects ?? [];

  const hasList = list.status === 'success' || list.status === 'refreshing';
  const rows = hasList ? list.data : [];
  const filtered = subjectId ? rows.filter((a) => a.subjectId === subjectId) : rows;

  const total = rows.length;
  const active = rows.filter((a) => a.status.label === 'Active').length;
  const closed = rows.filter((a) => a.status.label === 'Closed').length;
  const drafts = rows.filter((a) => a.status.label === 'Draft').length;
  const isLoading = list.status === 'loading';

  if (list.status === 'error' && list.error.kind === 'database-unavailable') {
    return (
      <div className="p-6">
        <DatabaseUnavailablePanel onRetry={() => teacherId && void assignmentsVm.loadAssignments(teacherId)} />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Assignments</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create, send, and track assignments for your classes.
          </p>
        </div>
        <Link
          href="/government/teacher/assignment/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-button text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          New Assignment
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: total, className: 'text-primary' },
          { label: 'Active', value: active, className: 'text-secondary' },
          { label: 'Closed', value: closed, className: 'text-amber-600' },
          { label: 'Drafts', value: drafts, className: 'text-gray-500' },
        ].map(({ label, value, className }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{label}</p>
            <p className={`text-3xl font-bold ${className}`}>{isLoading ? '—' : value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          options={[{ value: '', label: 'All Classes' }, ...myClasses.map((c) => ({ value: c.classId, label: c.className }))]}
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setSubjectId('');
          }}
          aria-label="Filter by class"
        />
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => setStatus(e.target.value as AssignmentStatus | '')}
          aria-label="Filter by status"
        />
        {subjectOptions.length > 0 && (
          <Select
            options={[{ value: '', label: 'All Subjects' }, ...subjectOptions.map((s) => ({ value: s.id, label: s.name }))]}
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            aria-label="Filter by subject"
          />
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : list.status === 'error' ? (
        <ErrorState
          message={list.error.userMessage}
          onRetry={() => teacherId && void assignmentsVm.loadAssignments(teacherId)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-12 h-12" />}
          title="No assignments yet"
          description="Click 'New Assignment' to create your first assignment."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full bg-white">
            <thead className="bg-secondary/20">
              <tr>
                {['Title', 'Class', 'Subject', 'Due Date', 'Submissions', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-sm font-bold text-slate-600 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-bold text-slate-600">{a.title}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-600">{a.className}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-600">{a.subjectName ?? '—'}</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-600">{a.dueDate}</td>
                  <td className="px-4 py-3 font-bold text-sm">
                    <span className={a.submittedCount > 0 ? 'text-secondary' : 'text-gray-400'}>
                      {a.submittedCount} / {a.totalStudents}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={a.status.badge === 'success' ? 'success' : a.status.badge === 'pending' ? 'warning' : 'neutral'}
                      size="sm"
                    >
                      {a.status.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/government/teacher/assignment/detail?id=${a.id}`}
                      className="text-sm font-bold text-secondary hover:text-secondary/80 transition-colors"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
