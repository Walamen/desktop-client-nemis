'use client';

import { useEffect } from 'react';
import {
  Users, UserCog2, Layers3, UserPlus, CalendarCheck, BookOpen, GraduationCap, Bell, Settings, Calendar,
} from 'lucide-react';
import { Skeleton, ErrorState } from '@nemis-desktop/ui';
import {
  useDashboardViewModel, useCurrentUserViewModel, useSettingsViewModel, useAcademicYearViewModel,
  useAcademicFoundationViewModel,
  useTeacherDashboardViewModel,
} from '@/lib/presentation/hooks';
import { useViewModel } from '@/hooks/use-view-model';
import { StatCard } from '@/components/dashboard/StatCard';
import { InfoTile } from '@/components/dashboard/InfoTile';
import { DatabaseUnavailablePanel } from '@/components/dashboard/DatabaseUnavailablePanel';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import QuickActionCard from '@/components/dashboard/QuickActionCard';
import RecentActivityFeed from '@/components/dashboard/RecentActivityFeed';
import TeachersListSection from '@/components/dashboard/TeachersListSection';

const STAT_ICONS: Record<string, typeof Users> = {
  'total-students': Users,
  'total-classes': Layers3,
};

export default function DashboardPage() {
  const dashboard = useDashboardViewModel();
  const currentUser = useCurrentUserViewModel();
  const settings = useSettingsViewModel();
  const academicYear = useAcademicYearViewModel();
  const academicFoundation = useAcademicFoundationViewModel();
  const teacherDashboard = useTeacherDashboardViewModel();

  const summary = useViewModel(dashboard.store, (s) => s.summary);
  const user = useViewModel(currentUser.store, (s) => s.user);
  const profile = useViewModel(settings.store, (s) => s.profile);
  const year = useViewModel(academicYear.store, (s) => s.current);
  const term = useViewModel(academicFoundation.store, (s) => s.currentTerm);
  const teachers = useViewModel(teacherDashboard.store, (s) => s.dashboard);

  // Bootstrap loads this on startup; only self-load if the store is still idle
  // (e.g. navigated here before bootstrap ran).
  useEffect(() => {
    if (summary.status === 'idle') void dashboard.loadOverview();
  }, [dashboard, summary.status]);

  const name = user.status === 'success' ? user.data.fullName : 'Principal';

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <DashboardGreeting name={name} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoTile label="School" value={profile.status === 'success' ? profile.data.name : null} emptyText="School profile not set up yet" />
          <InfoTile label="Academic Year" value={year.status === 'success' ? year.data.code : null} emptyText="No academic year configured" />
          <InfoTile label="Current Term" value={term.status === 'success' ? term.data.name : null} emptyText="No current term configured" />
        </div>

        {summary.status === 'error' && summary.error.kind === 'database-unavailable' ? (
          <DatabaseUnavailablePanel onRetry={() => void dashboard.loadOverview()} />
        ) : summary.status === 'error' ? (
          <ErrorState message={summary.error.userMessage} onRetry={() => void dashboard.loadOverview()} />
        ) : summary.status === 'success' || summary.status === 'refreshing' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {summary.data.stats.map((stat) => (
              <StatCard key={stat.key} stat={stat} icon={STAT_ICONS[stat.key] ?? Users} />
            ))}
            <InfoTile label="Attendance Today" value={`${summary.data.attendanceToday.present} / ${summary.data.attendanceToday.total}`} emptyText="No attendance recorded" />
            <InfoTile label="Total Teachers" value={teachers.status === 'success' || teachers.status === 'refreshing' ? String(teachers.data.totalTeachers) : null} emptyText="No teachers recorded" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-card" />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-300 rounded-card p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickActionCard title="Add Student" description="Enroll a new student" icon={UserPlus} href="/government/school-admin/students" variant="primary" />
              <QuickActionCard title="Record Attendance" description="Mark daily attendance" icon={CalendarCheck} href="/government/school-admin/attendance" variant="primary" />
              <QuickActionCard title="Manage Classes" description="View and edit classes" icon={BookOpen} href="/government/school-admin/classes" />
              <QuickActionCard title="Grade Records" description="View student grades" icon={GraduationCap} href="/government/school-admin/academic-grading" />
              <QuickActionCard title="Add Teacher" description="Register new staff" icon={UserCog2} href="/government/school-admin/teachers-staff" />
              <QuickActionCard title="Timetable" description="Manage schedules" icon={Calendar} href="/government/school-admin/timetable" />
              <QuickActionCard title="Notifications" description="Send announcements" icon={Bell} href="/government/school-admin/notifications" />
              <QuickActionCard title="Settings" description="School configuration" icon={Settings} href="/government/school-admin/settings" />
            </div>
          </div>
          <RecentActivityFeed />
        </div>

        {(summary.status === 'success' || summary.status === 'refreshing') && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><section className="bg-white border border-slate-300 rounded-card p-6"><h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Students by Grade</h2>{summary.data.studentsByGrade.length === 0 ? <p className="text-sm text-slate-500">No enrolled grade data available.</p> : summary.data.studentsByGrade.map(item => <div key={item.gradeLevel} className="flex justify-between border-b py-2 text-sm"><span>{item.gradeLevel.replaceAll('_',' ')}</span><strong>{item.studentCount}</strong></div>)}</section><section className="bg-white border border-slate-300 rounded-card p-6"><h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Recently Enrolled Students</h2>{summary.data.recentlyEnrolled.length === 0 ? <p className="text-sm text-slate-500">No students have been enrolled.</p> : summary.data.recentlyEnrolled.map(student => <a key={student.id} href={`/government/school-admin/students/profile?id=${student.id}`} className="flex justify-between border-b py-2 text-sm text-blue-700"><span>{student.fullName}</span><span>{student.admissionNumber}</span></a>)}</section></div>}

        <div className="bg-white border border-slate-300 rounded-card p-6"><h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Enrollment Trends</h2><p className="mt-2 text-sm text-slate-500">Trend analysis will appear after synchronized historical enrollment data is available.</p></div>

        <TeachersListSection />
      </div>
    </div>
  );
}
