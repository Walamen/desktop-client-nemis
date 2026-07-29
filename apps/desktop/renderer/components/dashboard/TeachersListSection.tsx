'use client';
import { useEffect } from 'react';
import { Card, ErrorState, Skeleton, EmptyState, Avatar } from '@nemis-desktop/ui';
import { Users, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTeacherDashboardViewModel } from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';

const human = (v: string) => v.replaceAll('_', ' ');

/** Staff roster section — mirrors portal-web's TeachersListSection (avatar
 * rows with name + employee number, "View All" link) using the recently
 * added teachers already surfaced by the teacher dashboard query. The
 * subject/employment breakdown cards below are a desktop-only addition kept
 * for the offline admin's benefit. */
export default function TeachersListSection() {
  const vm = useTeacherDashboardViewModel();
  const state = useViewModel(vm.store, (s) => s.dashboard);
  useEffect(() => {
    if (state.status === 'idle') void vm.load();
  }, [vm, state.status]);

  if (state.status === 'loading' || state.status === 'idle') {
    return <Skeleton className="h-48 w-full rounded-card" />;
  }
  if (state.status === 'error') {
    return <ErrorState message={state.error.userMessage} onRetry={() => void vm.load()} />;
  }

  const d = state.status === 'success' || state.status === 'refreshing' ? state.data : null;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-dark flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Teaching Staff
            </h2>
            <p className="text-sm text-gray-600 mt-1">Active teachers in your school</p>
          </div>
          <Link
            href="/government/school-admin/teachers-staff"
            className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1"
          >
            View All
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {!d || d.recentlyAdded.length === 0 ? (
          <EmptyState
            icon={<Users className="w-12 h-12" />}
            title="No teachers found."
            description="Start by adding teachers to your school."
          />
        ) : (
          <div className="space-y-3">
            {d.recentlyAdded.slice(0, 6).map((teacher) => (
              <div
                key={teacher.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-primary/30 hover:bg-gray-50 transition-all"
              >
                <div className="flex-shrink-0">
                  <Avatar firstName={teacher.firstName} lastName={teacher.lastName} role="teacher" size="md" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-neutral-dark truncate">
                    {teacher.firstName} {teacher.lastName}
                  </h4>
                  <p className="text-xs text-gray-600 truncate">{teacher.employeeNumber}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {d && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <h2 className="font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Assignment Summary
            </h2>
            <p className="text-3xl font-semibold mt-4">{d.totalAssignments}</p>
            <p className="text-sm text-slate-500">active class and subject assignments</p>
            <p className="text-sm mt-3">{d.unassignedTeachers} unassigned teacher(s)</p>
          </Card>
          <Card>
            <h2 className="font-semibold">Teachers by Subject</h2>
            {d.bySubject.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">No teachers assigned to a subject.</p>
            ) : (
              d.bySubject.slice(0, 6).map((v) => (
                <div key={v.subjectId} className="flex justify-between border-b py-2 text-sm">
                  <span>{v.subjectName}</span>
                  <strong>{v.teacherCount}</strong>
                </div>
              ))
            )}
          </Card>
          <Card>
            <h2 className="font-semibold">Employment Status</h2>
            {d.byEmploymentStatus.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">No teachers found.</p>
            ) : (
              d.byEmploymentStatus.map((v) => (
                <div key={v.employmentType} className="flex justify-between border-b py-2 text-sm">
                  <span>{human(v.employmentType)}</span>
                  <strong>{v.teacherCount}</strong>
                </div>
              ))
            )}
          </Card>
          <Card>
            <h2 className="font-semibold">Teachers by Grade</h2>
            {d.byGrade.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">No grade assignments.</p>
            ) : (
              d.byGrade.map((v) => (
                <div key={v.gradeLevel} className="flex justify-between border-b py-2 text-sm">
                  <span>{human(v.gradeLevel)}</span>
                  <strong>{v.teacherCount}</strong>
                </div>
              ))
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
