'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react';
import { Card, Spinner } from '@nemis-desktop/ui';
import type { DeoTeacher, TeacherGradesStatus } from '@nemis-desktop/types';
import {
  TEACHER_TABS,
  filterTeachersByTab,
  groupTeachersBySchool,
  teacherTabCounts,
  type TeacherTab,
} from '@nemis-desktop/presentation';
import { useDeoTeachersViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

type TeacherViewMode = 'individual' | 'bySchool';

const VIEW_MODES = [
  ['individual', 'Individual Teachers'],
  ['bySchool', 'By School'],
] as const;

const GRADES_CHIP: Record<TeacherGradesStatus, string> = {
  Pending: 'bg-amber-50 text-amber-700',
  Submitted: 'bg-green-50 text-green-700',
  'No assessments': 'bg-gray-100 text-gray-600',
};

const INDIVIDUAL_HEADINGS = ['Teacher', 'School', 'Subject', 'Attendance', 'Grades', 'Status'];
const SCHOOL_HEADINGS = ['School', 'Teachers', 'Pending Grades', 'Pending Approval', 'Unassigned', 'Status'];

function statusOf(teacher: DeoTeacher) {
  return teacher.pendingApproval
    ? { label: 'Pending Approval', className: 'bg-amber-50 text-amber-700' }
    : { label: 'Active', className: 'bg-green-50 text-green-700' };
}

function tabClass(active: boolean): string {
  return `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
    active ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  }`;
}

function TableHead({ headings }: { headings: readonly string[] }) {
  return (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        {headings.map((heading) => (
          <th
            key={heading}
            className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
          >
            {heading}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** DEO Teacher Monitoring, ported from portal-web
 * app/government/deo/teachers/page.tsx and read from this device.
 * Layout: docs/superpowers/specs/2026-11-15-deo-teachers-design.md. */
export function DeoTeachersPage() {
  const vm = useDeoTeachersViewModel();
  const state = useViewModel(vm.store, (s) => s.teachers);
  const [activeTab, setActiveTab] = useState<TeacherTab>('All');
  const [viewMode, setViewMode] = useState<TeacherViewMode>('individual');

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const teachers = useMemo(() => data?.teachers ?? [], [data]);
  const counts = useMemo(() => teacherTabCounts(teachers), [teachers]);
  const filtered = useMemo(() => filterTeachersByTab(teachers, activeTab), [teachers, activeTab]);
  const groups = useMemo(() => groupTeachersBySchool(filtered), [filtered]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (data && data.districtId === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <p className="text-gray-600">No district assigned to your account.</p>
        </div>
      </div>
    );
  }

  const place = [data?.district?.name, data?.county?.name].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
          <h1 className="text-xl font-bold text-white">Teacher Monitoring</h1>
        </div>
        {place ? (
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-widest">District</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">{place}</p>
          </div>
        ) : null}
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <p className="text-3xl font-bold text-gray-900 mb-1">{counts.All}</p>
            <p className="text-sm font-medium text-gray-900">Total Teachers</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-pending mb-1">{counts['Grades Pending']}</p>
            <p className="text-sm font-medium text-gray-900">Grades Pending</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-pending mb-1">{counts['Pending Approval']}</p>
            <p className="text-sm font-medium text-gray-900">Pending Approval</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-error mb-1">{counts.Unassigned}</p>
            <p className="text-sm font-medium text-gray-900">Unassigned</p>
          </Card>
        </div>

        <div className="flex gap-2">
          {VIEW_MODES.map(([mode, label]) => (
            <button key={mode} type="button" onClick={() => setViewMode(mode)} className={tabClass(viewMode === mode)}>
              {label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-1 gap-4">
            <h2 className="text-lg font-bold text-gray-900">Teacher Overview</h2>
            <div className="flex flex-wrap gap-2">
              {TEACHER_TABS.map((tab) => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={tabClass(activeTab === tab)}>
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">Teacher attendance is not recorded in NEMIS yet.</p>

          {state.status === 'error' ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">Failed to load teachers.</p>
              <button type="button" onClick={() => void vm.load()} className="mt-2 text-sm underline text-red-700">
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">No teachers found</p>
            </div>
          ) : viewMode === 'individual' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <TableHead headings={INDIVIDUAL_HEADINGS} />
                <tbody className="divide-y divide-gray-200">
                  {filtered.map((row) => {
                    const status = statusOf(row);
                    return (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                              <span className="text-sm font-semibold text-gray-600">
                                {row.firstName.charAt(0)}
                                {row.lastName.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {row.firstName} {row.lastName}
                              </div>
                              <div className="text-xs text-gray-500">{row.employeeNumber}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{row.schoolName}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{row.leadSubject}</td>
                        <td className="px-6 py-4 text-sm text-gray-400">Not recorded</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full ${GRADES_CHIP[row.gradesStatus]}`}
                          >
                            {row.gradesStatus === 'Submitted' ? (
                              <CheckCircle2 className="w-3 h-3" aria-hidden />
                            ) : row.gradesStatus === 'Pending' ? (
                              <Clock className="w-3 h-3" aria-hidden />
                            ) : null}
                            {row.gradesStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <TableHead headings={SCHOOL_HEADINGS} />
                <tbody className="divide-y divide-gray-200">
                  {groups.map((group) => (
                    <tr key={group.schoolId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">{group.schoolName}</div>
                        <div className="text-xs text-gray-500">
                          {group.subjects.slice(0, 3).join(', ') || 'No subjects linked'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{group.teacherCount}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{group.gradesPending}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{group.pendingApproval}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{group.unassigned}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                            group.needsAttention ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {group.needsAttention ? 'Needs Attention' : 'Stable'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
