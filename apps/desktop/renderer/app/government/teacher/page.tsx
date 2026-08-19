'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Users, ClipboardCheck, Award, Calendar, Bell, AlertCircle,
} from 'lucide-react';
import { Button, ErrorState } from '@nemis-desktop/ui';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useTeachingAssignmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { useViewModel } from '@/hooks/use-view-model';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { studentBridge } from '@/services/nemis-bridge/school-admin/student-bridge';
import { assignmentBridge } from '@/services/nemis-bridge/teacher/assignment-bridge';
import { StatCard } from '@/components/dashboard/StatCard';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { DatabaseUnavailablePanel } from '@/components/dashboard/DatabaseUnavailablePanel';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

interface MyClass {
  classId: string;
  className: string;
  section?: string;
  gradeLevel: string;
  academicYearName: string;
  subjects: string[];
  isClassTeacher: boolean;
}

interface ClassStats {
  enrolled: number;
  attendanceMarkedToday: boolean;
}

interface DueAssignment {
  id: string;
  title: string;
  classLabel: string;
  dueDate: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dueLabel(dueDate: string): string {
  const days = Math.round(
    (new Date(dueDate).getTime() - new Date(todayIso()).getTime()) / 86_400_000,
  );
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `${days} days`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'}`;
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  const currentUser = useCurrentUserViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const assignments = useViewModel(teachingAssignments.store, (s) => s.assignments);

  const userId = user.status === 'success' ? user.data.id : undefined;

  // The signed-in identity (`userId`, the `users` table) and the teaching
  // record used everywhere assignments/classes are keyed (`staff.id`, what
  // the backend calls Assignment.teacherId / TeachingAssignment.staffId) are
  // different id spaces — `staff.userId` is the (unique) bridge between them.
  const [staffId, setStaffId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void sharedBridge.listSchoolAdminRecords({ collection: 'staff', limit: 250 }).then((result) => {
      if (cancelled) return;
      const mine = result.items.find((r) => r.userId === userId);
      setStaffId(mine ? String(mine.id) : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useRevalidateOnSync(() => {
    if (staffId) void teachingAssignments.load(staffId);
  }, [staffId, teachingAssignments]);

  const hasAssignmentData = assignments.status === 'success' || assignments.status === 'refreshing';
  // A teacher with zero assigned classes lands on 'empty' (no `data` field),
  // which is a legitimate finished-loading state, not "still loading".
  const assignmentsLoaded = hasAssignmentData || assignments.status === 'empty';

  const myClasses = useMemo<MyClass[]>(() => {
    if (!hasAssignmentData) return [];
    const byClass = new Map<string, MyClass>();
    for (const a of assignments.data) {
      const existing = byClass.get(a.classId);
      if (existing) {
        if (a.subjectName && !existing.subjects.includes(a.subjectName)) existing.subjects.push(a.subjectName);
        existing.isClassTeacher = existing.isClassTeacher || a.isClassTeacher;
      } else {
        byClass.set(a.classId, {
          classId: a.classId, className: a.className, section: a.section,
          gradeLevel: a.gradeLevel, academicYearName: a.academicYearName,
          subjects: a.subjectName ? [a.subjectName] : [], isClassTeacher: a.isClassTeacher,
        });
      }
    }
    return Array.from(byClass.values());
  }, [hasAssignmentData, assignments]);

  const [classStats, setClassStats] = useState<Record<string, ClassStats>>({});

  useEffect(() => {
    if (myClasses.length === 0) return;
    let cancelled = false;
    const today = todayIso();
    void Promise.all(
      myClasses.map(async (cls) => {
        const [students, attendance] = await Promise.all([
          studentBridge.listStudents({ classId: cls.classId, limit: 1, offset: 0 }),
          sharedBridge.listAttendance({ classId: cls.classId, date: today }),
        ]);
        return [cls.classId, { enrolled: students.total, attendanceMarkedToday: attendance.length > 0 }] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setClassStats(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [myClasses]);

  const [dueAssignments, setDueAssignments] = useState<DueAssignment[] | null>(null);

  useRevalidateOnSync(() => {
    if (!staffId) return;
    let cancelled = false;
    // The assignment:list channel is already self-scoped to the calling
    // teacher server-side (see electron/ipc/handlers/teacher/assignments.ts)
    // — no client-side teacherId filter needed, and className/subjectName
    // arrive pre-joined instead of having to cross-reference myClasses.
    void assignmentBridge.listAssignments({}).then((items) => {
      if (cancelled) return;
      const today = todayIso();
      const upcoming = items
        .filter((a) => a.dueDate >= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 3)
        .map((a) => ({
          id: a.id,
          title: a.title,
          classLabel: `${a.className}${a.subjectName ? ` • ${a.subjectName}` : ''}`,
          dueDate: a.dueDate,
        }));
      setDueAssignments(upcoming);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  const name = user.status === 'success' ? user.data.fullName : 'Teacher';

  const statsReady = assignmentsLoaded && (myClasses.length === 0 || Object.keys(classStats).length === myClasses.length);
  const totalClasses = assignmentsLoaded ? myClasses.length : undefined;
  const totalStudents = statsReady
    ? Object.values(classStats).reduce((sum, c) => sum + c.enrolled, 0)
    : undefined;
  const pendingAttendance = statsReady
    ? myClasses.filter((c) => !classStats[c.classId]?.attendanceMarkedToday).length
    : undefined;

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <DashboardGreeting name={name} role="Teacher" />

        {assignments.status === 'error' && assignments.error.kind === 'database-unavailable' ? (
          <DatabaseUnavailablePanel onRetry={() => staffId && void teachingAssignments.load(staffId)} />
        ) : assignments.status === 'error' ? (
          <ErrorState
            message={assignments.error.userMessage}
            onRetry={() => staffId && void teachingAssignments.load(staffId)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard label="My Classes" value={totalClasses} icon={BookOpen} />
            <StatCard label="Total Students" value={totalStudents} icon={Users} />
            <StatCard label="Pending Attendance" value={pendingAttendance} icon={ClipboardCheck} valueClassName="text-pending" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">My Classes</h2>
            {!assignmentsLoaded ? (
              <p className="text-sm text-slate-500">Loading classes…</p>
            ) : myClasses.length === 0 ? (
              <div className="text-center py-8 bg-white border border-slate-300 rounded-card">
                <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-500">
                  No classes assigned yet. Contact your school administrator.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {myClasses.map((cls) => (
                  <div key={cls.classId} className="bg-white border border-slate-300 rounded-card p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-lg text-slate-900">{cls.className}</h4>
                        <p className="text-sm text-slate-500">{cls.gradeLevel.replaceAll('_', ' ')}</p>
                      </div>
                      {cls.isClassTeacher && (
                        <span className="text-xs bg-primary/20 text-slate-900 px-2 py-1 rounded font-semibold">
                          Homeroom
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-500 mb-4">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {classStats[cls.classId]?.enrolled ?? '—'} students
                      </span>
                      <span className="text-xs">{cls.academicYearName}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => router.push('/government/teacher/my-classes')}>
                        <Users className="w-4 h-4 mr-1.5" />
                        Students
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => router.push('/government/teacher/attendance')}>
                        <ClipboardCheck className="w-4 h-4 mr-1.5" />
                        Attendance
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => router.push('/government/teacher/grades')}>
                        <Award className="w-4 h-4 mr-1.5" />
                        Final Grades
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Assignments Due</h2>
            <div className="bg-white border border-slate-300 rounded-card mb-4 divide-y">
              {dueAssignments === null ? (
                <p className="p-4 text-sm text-slate-500">Loading assignments…</p>
              ) : dueAssignments.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No upcoming assignments due.</p>
              ) : (
                dueAssignments.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/20 rounded flex items-center justify-center shrink-0">
                        <ClipboardCheck className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.classLabel}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-secondary shrink-0">
                      <AlertCircle className="w-3 h-3" />
                      <span>{dueLabel(item.dueDate)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="bg-white border border-slate-300 rounded-card p-6">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="primary" fullWidth onClick={() => router.push('/government/teacher/attendance')}>
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  Mark Attendance
                </Button>
                <Button variant="secondary" fullWidth onClick={() => router.push('/government/teacher/grades')}>
                  <Award className="w-4 h-4 mr-2" />
                  Enter Grades
                </Button>
                <Button variant="secondary" fullWidth onClick={() => router.push('/government/teacher/timetable')}>
                  <Calendar className="w-4 h-4 mr-2" />
                  View Timetable
                </Button>
                <Button variant="secondary" fullWidth onClick={() => router.push('/government/teacher/notifications')}>
                  <Bell className="w-4 h-4 mr-2" />
                  Notifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
