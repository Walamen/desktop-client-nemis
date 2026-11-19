'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Building2, ChevronRight } from 'lucide-react';
import { Spinner } from '@nemis-desktop/ui';
import {
  SCHOOL_TABS,
  filterSchoolsByTab,
  formatLevels,
  schoolTabCounts,
  type SchoolTab,
} from '@nemis-desktop/presentation';
import { useDeoSchoolsViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

const STATUS_COLOR: Readonly<Record<string, string>> = {
  Compliant: 'text-slate-100 bg-active',
  'Needs Review': 'text-slate-100 bg-pending',
  Flagged: 'text-slate-100 bg-error',
};

function attendanceColor(attendance: number) {
  if (attendance >= 80) return 'bg-active';
  if (attendance >= 70) return 'bg-pending';
  return 'bg-error';
}

const detailHref = (id: string) => `/government/deo/schools/details?id=${encodeURIComponent(id)}`;

/** DEO Schools Management, ported from portal-web
 * app/government/deo/schools/page.tsx and read from this device. Layout:
 * docs/superpowers/specs/2026-11-14-deo-portal-web-design-reference.md §4.2. */
export function DeoSchoolsPage() {
  const router = useRouter();
  const vm = useDeoSchoolsViewModel();
  const state = useViewModel(vm.store, (s) => s.schools);
  const [activeTab, setActiveTab] = useState<SchoolTab>('All');

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

  const schools = data?.schools ?? [];
  const counts = schoolTabCounts(schools);
  const filtered = filterSchoolsByTab(schools, activeTab);
  const place = [data?.district?.name, data?.county?.name].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
          <h1 className="text-xl font-bold text-white">Schools Management</h1>
        </div>
        {place ? (
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-widest">District</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">{place}</p>
          </div>
        ) : null}
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="bg-white border border-gray-300 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Schools in District</h2>
              <p className="text-sm text-gray-600 mt-1">{schools.length} schools · Click a school to view details</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {SCHOOL_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 border border-gray-300 text-sm font-medium transition-colors ${
                  activeTab === tab ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab}
                <span className="ml-2 text-xs opacity-80">{counts[tab]}</span>
              </button>
            ))}
          </div>

          {state.status === 'error' ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">Failed to load schools. Please try again.</p>
              <button type="button" onClick={() => void vm.load()} className="mt-2 text-sm underline text-red-700">
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">No schools found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['School', 'Level', 'Principal', 'Students', 'Teachers', 'Attendance', 'Status'].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered.map((school) => (
                    <tr
                      key={school.id}
                      onClick={() => router.push(detailHref(school.id))}
                      className="hover:bg-gray-50 cursor-pointer border border-gray-300 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">{school.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-3 py-1 text-xs font-semibold">{formatLevels(school.levels)}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{school.principalName ?? 'Not recorded'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{school.students.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{school.teachers}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[60px]">
                            {school.attendanceRate !== null ? (
                              <div
                                className={`h-2 rounded-full ${attendanceColor(school.attendanceRate)}`}
                                style={{ width: `${school.attendanceRate}%` }}
                              />
                            ) : null}
                          </div>
                          <span className="text-sm font-semibold text-gray-900">
                            {school.attendanceRate === null ? '—' : `${school.attendanceRate}%`}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 text-xs font-semibold ${
                            STATUS_COLOR[school.complianceStatus] ?? 'text-gray-600 bg-gray-50'
                          }`}
                        >
                          {school.complianceStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight className="w-5 h-5 text-gray-400" />
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
