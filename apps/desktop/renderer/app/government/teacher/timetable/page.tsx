'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, LayoutGrid, Table2, Users } from 'lucide-react';
import { DayOfWeek } from '@nemis-desktop/types';
import { ErrorState, Spinner } from '@nemis-desktop/ui';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import {
  useTeacherScheduleViewModel,
  useTeachingAssignmentViewModel,
} from '@/lib/presentation/hooks/school-admin';
import { useViewModel } from '@/hooks/use-view-model';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { DatabaseUnavailablePanel } from '@/components/dashboard/DatabaseUnavailablePanel';

const DAYS = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY] as const;
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function getTodayDay(): (typeof DAYS)[number] {
  const jsDay = new Date().getDay(); // 0 = Sunday ... 6 = Saturday
  const index = jsDay - 1; // Monday -> 0 ... Friday -> 4
  return index >= 0 && index <= 4 ? DAYS[index]! : DayOfWeek.MONDAY;
}

/** Teacher's own class schedule — mirrors the portal-web "Timetable" page
 * (day tabs, table/card view toggle, period grid with free-period and
 * break rows) but reads from the shared TimetableViewModel (via
 * TeacherScheduleViewModel, self-scoped to the caller's staffId server-side
 * — see timetables.ts) instead of a single combined API call. Timetable
 * entries only carry `classId`/`subjectId`, so class and subject names are
 * resolved from this teacher's own teaching assignments — the same lookup
 * the Dashboard and My Classes pages build. */
export default function TeacherTimetablePage() {
  const currentUser = useCurrentUserViewModel();
  const teacherSchedule = useTeacherScheduleViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const entries = useViewModel(teacherSchedule.core.store, (s) => s.entries);
  const periods = useViewModel(teacherSchedule.core.store, (s) => s.periods);
  const assignments = useViewModel(teachingAssignments.store, (s) => s.assignments);

  const userId = user.status === 'success' ? user.data.id : undefined;

  // The signed-in identity (`userId`, the `users` table) and the id every
  // timetable/assignment record is keyed by (`staff.id`) are different id
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

  useEffect(() => {
    if (staffId && entries.status === 'idle') void teacherSchedule.load(staffId);
    if (periods.status === 'idle') void teacherSchedule.core.loadPeriods();
    if (staffId && assignments.status === 'idle') void teachingAssignments.load(staffId);
  }, [staffId, entries.status, periods.status, assignments.status, teacherSchedule, teachingAssignments]);

  const [selectedDay, setSelectedDay] = useState<(typeof DAYS)[number]>(getTodayDay());
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (assignments.status === 'success' || assignments.status === 'refreshing') {
      for (const a of assignments.data) {
        if (!map.has(a.classId)) map.set(a.classId, `${a.className}${a.section ? ` — ${a.section}` : ''}`);
      }
    }
    return map;
  }, [assignments]);

  const subjectNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (assignments.status === 'success' || assignments.status === 'refreshing') {
      for (const a of assignments.data) {
        if (a.subjectId && a.subjectName) map.set(a.subjectId, a.subjectName);
      }
    }
    return map;
  }, [assignments]);

  const periodsReady = periods.status === 'success' || periods.status === 'refreshing';
  const entriesReady = entries.status === 'success' || entries.status === 'refreshing';
  const loading = periods.status === 'idle' || periods.status === 'loading';

  const sortedPeriods = useMemo(
    () => (periodsReady ? [...periods.data].sort((a, b) => a.order - b.order) : []),
    [periodsReady, periods],
  );

  const entriesForDay = useMemo(
    () => (entriesReady ? entries.data.filter((e) => e.dayOfWeek === selectedDay) : []),
    [entriesReady, entries, selectedDay],
  );

  const todayJs = new Date().getDay();
  const currentDayIndex = todayJs === 0 ? -1 : todayJs - 1;

  if (entries.status === 'error' && entries.error.kind === 'database-unavailable') {
    return (
      <div className="min-h-full bg-slate-100 px-6 py-6">
        <DatabaseUnavailablePanel onRetry={() => staffId && void teacherSchedule.load(staffId)} />
      </div>
    );
  }
  if (entries.status === 'error') {
    return (
      <div className="min-h-full bg-slate-100 px-6 py-6">
        <ErrorState
          message={entries.error.userMessage}
          onRetry={() => staffId && void teacherSchedule.load(staffId)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        {/* Day Tabs */}
        {!loading && sortedPeriods.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {DAYS.map((day, index) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap border transition-colors ${
                    selectedDay === day
                      ? 'bg-secondary/10 border-slate-300 text-primary'
                      : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  {DAY_LABELS[index]}
                  {index === currentDayIndex && <span className="text-[10px] font-normal opacity-80">(Today)</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-300 p-1 shrink-0 bg-white">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'table' ? 'bg-secondary/10 text-primary' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'card' ? 'bg-secondary/10 text-primary' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Card
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-slate-300 rounded-card flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : sortedPeriods.length === 0 ? (
          <div className="bg-white border border-slate-300 rounded-card text-center py-12">
            <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              No timetable has been set up yet. Contact your school administrator.
            </p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto bg-white border border-slate-300 rounded-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-secondary/20 text-slate-700">
                  <th className="border-r border-slate-300 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    Time
                  </th>
                  <th className="border-r border-slate-300 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    Class
                  </th>
                  <th className="border-r border-slate-300 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Room</th>
                </tr>
              </thead>
              <tbody>
                {sortedPeriods.map((period) => {
                  if (period.isBreak) {
                    const label = period.startTime >= '12:00' ? 'LUNCH' : 'BREAK';
                    return (
                      <tr key={`${period.startTime}-${period.endTime}`} className="bg-slate-50">
                        <td className="border-b border-r border-slate-200 px-4 py-4 font-medium text-slate-500 whitespace-nowrap">
                          {period.startTime} – {period.endTime}
                        </td>
                        <td colSpan={3} className="border-b border-slate-200 px-4 py-4 text-center">
                          <span className="text-sm text-slate-400 font-medium">— {label} —</span>
                        </td>
                      </tr>
                    );
                  }

                  const entry = entriesForDay.find(
                    (e) => e.startTime === period.startTime && e.endTime === period.endTime,
                  );

                  return (
                    <tr key={`${period.startTime}-${period.endTime}`} className="hover:bg-slate-50/50">
                      <td className="border-b border-r border-slate-200 px-4 py-5 font-medium text-slate-700 whitespace-nowrap">
                        {period.startTime} – {period.endTime}
                      </td>
                      {entry ? (
                        <>
                          <td className="border-b border-r border-slate-200 px-4 py-5">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-sm font-medium text-primary">
                              <Users className="w-3.5 h-3.5" />
                              {classNameById.get(entry.classId) ?? entry.classId}
                            </span>
                          </td>
                          <td className="border-b border-r border-slate-200 px-4 py-5 text-sm text-slate-700">
                            {entry.subjectId ? (subjectNameById.get(entry.subjectId) ?? '—') : 'Homeroom'}
                          </td>
                          <td className="border-b border-slate-200 px-4 py-5 text-sm text-slate-500">
                            {entry.room || '—'}
                          </td>
                        </>
                      ) : (
                        <td colSpan={3} className="border-b border-slate-200 px-4 py-5 text-center">
                          <span className="text-sm text-slate-300">Free period</span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedPeriods.map((period) => {
              if (period.isBreak) {
                const label = period.startTime >= '12:00' ? 'LUNCH' : 'BREAK';
                return (
                  <div
                    key={`${period.startTime}-${period.endTime}`}
                    className="rounded-card border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {period.startTime} – {period.endTime}
                    </p>
                    <p className="text-sm text-slate-400 font-medium mt-1">— {label} —</p>
                  </div>
                );
              }

              const entry = entriesForDay.find(
                (e) => e.startTime === period.startTime && e.endTime === period.endTime,
              );

              return (
                <div
                  key={`${period.startTime}-${period.endTime}`}
                  className={`rounded-card border px-4 py-3 ${
                    entry ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {period.startTime} – {period.endTime}
                  </p>
                  {entry ? (
                    <div className="mt-2 space-y-1">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-sm font-medium text-primary">
                        <Users className="w-3.5 h-3.5" />
                        {classNameById.get(entry.classId) ?? entry.classId}
                      </span>
                      <p className="text-sm text-slate-700">
                        {entry.subjectId ? (subjectNameById.get(entry.subjectId) ?? '—') : 'Homeroom'}
                      </p>
                      {entry.room && <p className="text-xs text-slate-400">Room: {entry.room}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300 mt-2">Free period</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
