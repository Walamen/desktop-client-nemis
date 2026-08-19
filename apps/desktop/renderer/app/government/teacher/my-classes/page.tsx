'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, Users, ClipboardCheck, Eye,
} from 'lucide-react';
import { Button, EmptyState, ErrorState, Spinner } from '@nemis-desktop/ui';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useTeachingAssignmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { useViewModel } from '@/hooks/use-view-model';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { studentBridge } from '@/services/nemis-bridge/school-admin/student-bridge';
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
}

/** "My Classes" — mirrors the portal-web page (stats row, class table with
 * subject chips and a roster action), sourced from teaching assignments and
 * the student bridge instead of a live API, matching the pattern already
 * used on the Teacher Dashboard page. "View" opens the class detail page
 * (see classes/detail/page.tsx), the desktop equivalent of the web's
 * `/my-classes/classes/[id]` route. */
export default function MyClassesPage() {
  const currentUser = useCurrentUserViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const assignments = useViewModel(teachingAssignments.store, (s) => s.assignments);

  const userId = user.status === 'success' ? user.data.id : undefined;

  // The signed-in identity (`userId`, the `users` table) and the id every
  // teaching-assignment record is keyed by (`staff.id`) are different id
  // spaces — `staff.userId` is the (unique) bridge between them. Mirrors
  // government/teacher/page.tsx.
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
    void Promise.all(
      myClasses.map(async (cls) => {
        const students = await studentBridge.listStudents({ classId: cls.classId, limit: 1, offset: 0 });
        return [cls.classId, { enrolled: students.total }] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setClassStats(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [myClasses]);

  const totalStudents = Object.values(classStats).reduce((sum, c) => sum + c.enrolled, 0);
  const homeroomCount = myClasses.filter((c) => c.isClassTeacher).length;

  if (assignments.status === 'error' && assignments.error.kind === 'database-unavailable') {
    return (
      <div className="min-h-full bg-slate-100 px-6 py-6">
        <DatabaseUnavailablePanel onRetry={() => staffId && void teachingAssignments.load(staffId)} />
      </div>
    );
  }
  if (assignments.status === 'error') {
    return (
      <div className="min-h-full bg-slate-100 px-6 py-6">
        <ErrorState
          message={assignments.error.userMessage}
          onRetry={() => staffId && void teachingAssignments.load(staffId)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-300 rounded-card p-6 text-center">
            <p className="text-sm text-slate-500 mb-1">Total Classes</p>
            <p className="text-2xl font-bold text-slate-900">{assignmentsLoaded ? myClasses.length : '-'}</p>
          </div>
          <div className="bg-white border border-slate-300 rounded-card p-6 text-center">
            <p className="text-sm text-slate-500 mb-1">Homeroom Classes</p>
            <p className="text-2xl font-bold text-primary">{assignmentsLoaded ? homeroomCount : '-'}</p>
          </div>
          <div className="bg-white border border-slate-300 rounded-card p-6 text-center">
            <p className="text-sm text-slate-500 mb-1">Total Students</p>
            <p className="text-2xl font-bold text-secondary">{assignmentsLoaded ? totalStudents : '-'}</p>
          </div>
        </div>

        {!assignmentsLoaded ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : myClasses.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-12 h-12" />}
            title="No classes assigned"
            description="You have not been assigned to any classes yet. Please contact your school administrator."
          />
        ) : (
          <div className="overflow-x-auto bg-white border border-slate-300 rounded-card">
            <table className="w-full">
              <thead className="bg-secondary/20 text-slate-700">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-bold uppercase">Class</th>
                  <th className="text-left py-3 px-4 text-xs font-bold uppercase">Subjects</th>
                  <th className="text-left py-3 px-4 text-xs font-bold uppercase">Students</th>
                  <th className="text-left py-3 px-4 text-xs font-bold uppercase">Academic Year</th>
                  <th className="text-left py-3 px-4 text-xs font-bold uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myClasses.map((cls) => (
                  <tr key={cls.classId} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <p className="text-sm font-semibold text-slate-900">
                        {cls.className}
                        {cls.section ? ` — ${cls.section}` : ''}
                      </p>
                      <p className="text-xs text-slate-500">{cls.gradeLevel.replaceAll('_', ' ')}</p>
                      {cls.isClassTeacher && (
                        <span className="inline-block mt-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                          Homeroom
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {cls.subjects.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {cls.subjects.slice(0, 2).map((subject) => (
                            <span key={subject} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                              {subject}
                            </span>
                          ))}
                          {cls.subjects.length > 2 && (
                            <span className="text-xs text-slate-500">+{cls.subjects.length - 2} more</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">No subjects</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-900">
                          {classStats[cls.classId]?.enrolled ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-500">{cls.academicYearName}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/government/teacher/my-classes/classes/detail?id=${cls.classId}`}>
                          <Button size="sm">
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                        </Link>
                        <Link href="/government/teacher/attendance">
                          <Button size="sm" variant="secondary">
                            <ClipboardCheck className="w-4 h-4 mr-1" />
                            Attendance
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
