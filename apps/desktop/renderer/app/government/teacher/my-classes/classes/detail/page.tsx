'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Award, BookOpen, Calendar, ClipboardCheck, GraduationCap, Users,
} from 'lucide-react';
import type { StudentListItemResult } from '@nemis-desktop/types';
import { Button, EmptyState, Skeleton, Spinner } from '@nemis-desktop/ui';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useTeachingAssignmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { useViewModel } from '@/hooks/use-view-model';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { studentBridge } from '@/services/nemis-bridge/school-admin/student-bridge';
import { genderBadgeClass, genderLabel, human, queryId } from '@/components/teachers/shared';

interface ClassHeader {
  classId: string;
  className: string;
  section?: string;
  gradeLevel: string;
  academicYearName: string;
  isClassTeacher: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Desktop equivalent of the portal-web `/my-classes/classes/[id]` detail
 * page: class header, headline stats, and the full student roster — for a
 * class this teacher is actually assigned to (looked up from their own
 * teaching assignments, not the general class directory, so a stray id
 * someone isn't assigned to correctly reads as "not found" rather than
 * leaking another teacher's roster).
 *
 * Follows the desktop convention of a static route + `?id=` query param
 * (see components/teachers/shared.tsx `queryId()`) rather than a Next.js
 * `[id]` dynamic segment, matching school-admin/classes/detail.
 *
 * The web page's "Attendance Rate" stat is a hardcoded 95% for every class;
 * here it's computed from today's actual attendance records (or reported as
 * not-yet-recorded) rather than carrying the placeholder over. */
export default function ClassDetailPage() {
  const currentUser = useCurrentUserViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const assignments = useViewModel(teachingAssignments.store, (s) => s.assignments);

  const teacherId = user.status === 'success' ? user.data.id : undefined;
  const [classId, setClassId] = useState('');

  useEffect(() => {
    setClassId(queryId());
  }, []);

  useEffect(() => {
    if (teacherId && assignments.status === 'idle') void teachingAssignments.load(teacherId);
  }, [teacherId, assignments.status, teachingAssignments]);

  const hasAssignmentData = assignments.status === 'success' || assignments.status === 'refreshing';
  const assignmentsLoaded = hasAssignmentData || assignments.status === 'empty';

  const cls = useMemo<ClassHeader | undefined>(() => {
    if (!hasAssignmentData || !classId) return undefined;
    const forClass = assignments.data.filter((a) => a.classId === classId);
    const first = forClass[0];
    if (!first) return undefined;
    return {
      classId,
      className: first.className,
      section: first.section,
      gradeLevel: first.gradeLevel,
      academicYearName: first.academicYearName,
      isClassTeacher: forClass.some((a) => a.isClassTeacher),
    };
  }, [hasAssignmentData, assignments, classId]);

  const [roster, setRoster] = useState<readonly StudentListItemResult[] | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    setRosterLoading(true);
    void studentBridge.listStudents({ classId, limit: 200, offset: 0 }).then((result) => {
      if (cancelled) return;
      setRoster(result.items);
      setRosterLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  // undefined = still loading, null = loaded but nothing recorded today.
  const [attendanceRate, setAttendanceRate] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    void sharedBridge.listAttendance({ classId, date: todayIso() }).then((records) => {
      if (cancelled) return;
      if (records.length === 0) {
        setAttendanceRate(null);
        return;
      }
      const present = records.filter((r) => r.status === 'PRESENT').length;
      setAttendanceRate(Math.round((present / records.length) * 100));
    });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const totalCount = roster?.length;
  const maleCount = roster?.filter((s) => s.gender === 'MALE').length;
  const femaleCount = roster?.filter((s) => s.gender === 'FEMALE').length;

  const notFound = assignmentsLoaded && classId !== '' && !cls;

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link
            href="/government/teacher/my-classes"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to My Classes
          </Link>
          {cls && (
            <div className="flex gap-2">
              <Link href="/government/teacher/attendance">
                <Button size="sm" variant="secondary">
                  <ClipboardCheck className="w-4 h-4 mr-1" />
                  Mark Attendance
                </Button>
              </Link>
              <Link href="/government/teacher/grades">
                <Button size="sm" variant="secondary">
                  <Award className="w-4 h-4 mr-1" />
                  Manage Grades
                </Button>
              </Link>
            </div>
          )}
        </div>

        {notFound ? (
          <EmptyState
            icon={<BookOpen className="w-12 h-12" />}
            title="Class not found"
            description="This class doesn't exist or you don't have access to it."
          />
        ) : !cls ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="bg-white border border-slate-300 rounded-card p-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center shrink-0">
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 mb-1">
                    {cls.className}
                    {cls.section ? ` — ${cls.section}` : ''}
                  </h1>
                  <p className="text-slate-500 mb-2">{human(cls.gradeLevel)}</p>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>{totalCount ?? '—'} Students</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{cls.academicYearName}</span>
                    </div>
                    {cls.isClassTeacher && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        Homeroom
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-300 rounded-card p-6 text-center">
                <p className="text-sm text-slate-500 mb-1">Total Students</p>
                <p className="text-2xl font-bold text-slate-900">{totalCount ?? '-'}</p>
              </div>
              <div className="bg-white border border-slate-300 rounded-card p-6 text-center">
                <p className="text-sm text-slate-500 mb-1">Male Students</p>
                <p className="text-2xl font-bold text-secondary">{maleCount ?? '-'}</p>
              </div>
              <div className="bg-white border border-slate-300 rounded-card p-6 text-center">
                <p className="text-sm text-slate-500 mb-1">Female Students</p>
                <p className="text-2xl font-bold text-pink-600">{femaleCount ?? '-'}</p>
              </div>
              <div className="bg-white border border-slate-300 rounded-card p-6 text-center">
                <p className="text-sm text-slate-500 mb-1">Attendance Today</p>
                <p className="text-2xl font-bold text-active">
                  {attendanceRate === undefined ? '-' : attendanceRate === null ? 'N/A' : `${attendanceRate}%`}
                </p>
                {attendanceRate === null && <p className="text-xs text-slate-400 mt-1">Not recorded today</p>}
              </div>
            </div>

            <div className="overflow-x-auto bg-white border border-slate-300 rounded-card">
              <table className="w-full">
                <thead className="bg-secondary/20 text-slate-700">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-bold uppercase">#</th>
                    <th className="text-left py-3 px-4 text-xs font-bold uppercase">Student Name</th>
                    <th className="text-left py-3 px-4 text-xs font-bold uppercase">Admission No.</th>
                    <th className="text-left py-3 px-4 text-xs font-bold uppercase">Gender</th>
                    <th className="text-left py-3 px-4 text-xs font-bold uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rosterLoading ? (
                    <tr>
                      <td colSpan={5} className="py-8">
                        <div className="flex justify-center">
                          <Spinner size="lg" />
                        </div>
                      </td>
                    </tr>
                  ) : !roster || roster.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12">
                        <EmptyState
                          icon={<Users className="w-12 h-12" />}
                          title="No students enrolled"
                          description="This class doesn't have any students enrolled yet."
                        />
                      </td>
                    </tr>
                  ) : (
                    roster.map((student, index) => (
                      <tr key={student.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm text-slate-500">{index + 1}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                              <GraduationCap className="w-5 h-5 text-primary" />
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{student.fullName}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm font-medium text-slate-900">{student.admissionNumber}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${genderBadgeClass(student.gender)}`}
                          >
                            {genderLabel(student.gender)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              student.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {student.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
