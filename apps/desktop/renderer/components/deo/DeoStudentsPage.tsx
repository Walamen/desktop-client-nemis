'use client';

import { AlertTriangle, GraduationCap, TrendingDown } from 'lucide-react';
import { Card, Spinner } from '@nemis-desktop/ui';
import {
  atRiskLabel,
  attendanceColor,
  formatLevels,
  levelChipClass,
  performanceChipClass,
} from '@nemis-desktop/presentation';
import { useDeoStudentsViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

const HEADINGS = ['School', 'Level', 'Total', 'Teachers', 'Attendance', 'Status'];
/** Circumference of the gender ring (r = 40). */
const RING = 251.2;

function Banner({ place }: { place: string }) {
  return (
    <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
        <h1 className="text-xl font-bold text-white">Students & Enrollment</h1>
      </div>
      {place ? (
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase tracking-widest">District</p>
          <p className="text-sm font-semibold text-slate-200 mt-0.5">{place}</p>
        </div>
      ) : null}
    </div>
  );
}

/** DEO Students & Enrollment, ported from portal-web
 * app/government/deo/students/page.tsx and computed on this device.
 * Rules: docs/superpowers/specs/2026-11-15-deo-students-design.md. */
export function DeoStudentsPage() {
  const vm = useDeoStudentsViewModel();
  const state = useViewModel(vm.store, (s) => s.enrollment);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // A failed load has no data: show only the error, never zero cards an
  // officer could read as real figures.
  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        <Banner place="" />
        <div className="px-6 py-6">
          <div className="bg-white border border-gray-300 rounded-2xl p-6 text-center py-12">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-gray-600 text-sm">Failed to load enrollment data.</p>
            <button type="button" onClick={() => void vm.load()} className="mt-2 text-sm underline text-red-700">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
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

  const summary = data?.summary ?? { totalEnrollment: 0, male: 0, female: 0, avgAttendance: null };
  const trend = data?.enrollmentTrend.slice(-6) ?? [];
  const maxTrend = Math.max(...trend.map((item) => item.enrollment), 0);
  const schools = data?.schools ?? [];
  const dropoutAlerts = data?.dropoutAlerts ?? [];
  const male = data?.genderDistribution.male ?? 0;
  const female = data?.genderDistribution.female ?? 0;
  const ringTotal = summary.totalEnrollment || 1;
  const place = [data?.district?.name, data?.county?.name].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <Banner place={place} />

      <div className="px-6 py-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <p className="text-3xl font-bold text-gray-900 mb-1">{summary.totalEnrollment.toLocaleString()}</p>
            <p className="text-sm font-medium text-gray-900">Total Enrollment</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-secondary mb-1">{summary.male.toLocaleString()}</p>
            <p className="text-sm font-medium text-gray-900">Male Students</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-pending mb-1">{summary.female.toLocaleString()}</p>
            <p className="text-sm font-medium text-gray-900">Female Students</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-gray-900 mb-1">
              {summary.avgAttendance === null ? '—' : `${summary.avgAttendance}%`}
            </p>
            <p className="text-sm font-medium text-gray-900">Avg Attendance</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-300 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Enrollment Trend</h3>
            <div className="h-[200px] flex items-end justify-between gap-2">
              {trend.map((item) => (
                <div key={item.period} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-[#0ea5e9] rounded-t"
                    style={{ height: `${maxTrend > 0 ? Math.max((item.enrollment / maxTrend) * 150, 12) : 0}px` }}
                  />
                  <span className="text-xs text-gray-500 mt-2">{item.period}</span>
                </div>
              ))}
              {trend.length === 0 ? (
                <div className="w-full text-center text-gray-500 text-sm">No data available</div>
              ) : null}
            </div>
          </div>

          <div className="bg-white border border-gray-300 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Gender Split</h3>
            <div className="flex items-center justify-center h-[200px]">
              <div className="relative w-40 h-40">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90" aria-hidden>
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#025981"
                    strokeWidth="20"
                    strokeDasharray={`${(male / ringTotal) * RING} ${RING}`}
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#913d05"
                    strokeWidth="20"
                    strokeDasharray={`${(female / ringTotal) * RING} ${RING}`}
                    strokeDashoffset={`-${(male / ringTotal) * RING}`}
                  />
                </svg>
              </div>
              <div className="ml-6 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-secondary rounded-full" />
                  <span className="text-sm text-gray-600">Male: {male.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-pending rounded-full" />
                  <span className="text-sm text-gray-600">Female: {female.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-300 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Enrollment by School</h3>
          {schools.length === 0 ? (
            <div className="text-center py-12">
              <GraduationCap className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">No enrollment data found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {HEADINGS.map((heading) => (
                      <th
                        key={heading}
                        className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {schools.map((row) => {
                    const level = formatLevels(row.levels);
                    return (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{row.name}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${levelChipClass(level)}`}
                          >
                            {level}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{row.students.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{row.teachers.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <span className={`text-sm font-semibold ${attendanceColor(row.attendanceRate)}`}>
                            {row.attendanceRate === null ? 'No Data' : `${row.attendanceRate}%`}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${performanceChipClass(row.performanceStatus)}`}
                          >
                            {row.performanceStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {dropoutAlerts.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Dropout Alerts</h3>
            <div className="space-y-3">
              {dropoutAlerts.map((alert) => (
                <div
                  key={alert.schoolId}
                  className="flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                      <TrendingDown className="w-4 h-4 text-red-600" aria-hidden />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{alert.schoolName}</p>
                      <p className="text-xs text-gray-600">Reason: {alert.reason}</p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold ${alert.atRiskStudents > 0 ? 'text-red-600' : 'text-gray-500'}`}
                  >
                    {atRiskLabel(alert.atRiskStudents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
