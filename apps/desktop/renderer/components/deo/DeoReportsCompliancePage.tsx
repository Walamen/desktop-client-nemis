'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock3, Eye, FileWarning, XCircle } from 'lucide-react';
import type { DeoComplianceItem } from '@nemis-desktop/types';
import { useDeoReportsComplianceViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

type ComplianceStatus = 'ALL' | DeoComplianceItem['status'];

const statusStyles: Record<ComplianceStatus, string> = {
  ALL: 'bg-teal-600 text-white',
  APPROVED: 'bg-green-50 text-green-700',
  PENDING: 'bg-amber-50 text-amber-700',
  REJECTED: 'bg-red-50 text-red-700',
  MISSING: 'bg-slate-100 text-slate-700',
};

const EMPTY_ITEMS: DeoComplianceItem[] = [];
const EMPTY_SUMMARY = { total: 0, approved: 0, pending: 0, rejected: 0, missing: 0 };

function formatDate(date: string | null) {
  if (!date) return 'Not submitted';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

/** DEO Reports & Compliance, ported from portal-web
 * app/government/deo/reports/page.tsx and read from this device. */
export function DeoReportsCompliancePage() {
  const router = useRouter();
  const vm = useDeoReportsComplianceViewModel();
  const state = useViewModel(vm.store, (s) => s.compliance);
  const [statusFilter, setStatusFilter] = useState<ComplianceStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const items = data?.items ?? EMPTY_ITEMS;
  const summary = data?.summary ?? EMPTY_SUMMARY;
  const place = [data?.district?.name, data?.county?.name].filter(Boolean).join(' · ');
  const isLoading = state.status === 'idle' || state.status === 'loading';
  const error = state.status === 'error';

  const reportTypes = useMemo(() => ['ALL', ...Array.from(new Set(items.map((item) => item.reportType)))], [items]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const statusMatches = statusFilter === 'ALL' ? true : item.status === statusFilter;
        const typeMatches = typeFilter === 'ALL' ? true : item.reportType === typeFilter;
        return statusMatches && typeMatches;
      }),
    [items, statusFilter, typeFilter],
  );

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

  const statusTabs: Array<{ label: ComplianceStatus; count: number; icon: React.ReactNode }> = [
    { label: 'ALL', count: summary.total, icon: <CheckCircle2 className="w-4 h-4" /> },
    { label: 'APPROVED', count: summary.approved, icon: <CheckCircle2 className="w-4 h-4" /> },
    { label: 'PENDING', count: summary.pending, icon: <Clock3 className="w-4 h-4" /> },
    { label: 'REJECTED', count: summary.rejected, icon: <XCircle className="w-4 h-4" /> },
    { label: 'MISSING', count: summary.missing, icon: <FileWarning className="w-4 h-4" /> },
  ];

  const headCell = 'px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider';

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
          <h1 className="text-xl font-bold text-white">Reports & Compliance</h1>
        </div>
        {place ? (
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-widest">District</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">{place}</p>
          </div>
        ) : null}
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.approved}</div>
            <p className="text-sm font-medium text-gray-500 mt-1">Approved</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
              <Clock3 className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.pending}</div>
            <p className="text-sm font-medium text-gray-500 mt-1">Pending</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.rejected}</div>
            <p className="text-sm font-medium text-gray-500 mt-1">Rejected</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
              <FileWarning className="w-5 h-5 text-slate-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.missing}</div>
            <p className="text-sm font-medium text-gray-500 mt-1">Missing</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {statusTabs.map((tab) => {
                const isActive = statusFilter === tab.label;
                return (
                  <button
                    type="button"
                    key={tab.label}
                    onClick={() => setStatusFilter(tab.label)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-sky-700 text-white'
                        : tab.label === 'ALL'
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : statusStyles[tab.label]
                    }`}
                  >
                    {tab.icon}
                    {tab.label === 'ALL' ? 'All' : tab.label.charAt(0) + tab.label.slice(1).toLowerCase()}
                    <span className="text-xs opacity-80">{tab.count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {reportTypes.map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    typeFilter === type ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type === 'ALL' ? 'All' : type}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-14 rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">Failed to load reports and compliance data.</p>
              <button
                type="button"
                onClick={() => void vm.load()}
                className="mt-4 px-4 py-2 rounded-full text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center">
              <FileWarning className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">No compliance records matched your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className={headCell}>School</th>
                    <th className={headCell}>Record Type</th>
                    <th className={headCell}>Period</th>
                    <th className={headCell}>Submitted By / Record</th>
                    <th className={headCell}>Date</th>
                    <th className={headCell}>Status</th>
                    <th className={headCell}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">{item.schoolName}</div>
                        <div className="text-xs text-gray-500">{item.schoolCode}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{item.reportType}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{item.period}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{item.submittedBy}</div>
                        <div className="text-xs text-gray-500">{item.note}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(item.date)}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusStyles[item.status]}`}
                        >
                          {item.status.charAt(0) + item.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/government/deo/schools/details?id=${encodeURIComponent(item.schoolId)}`)
                            }
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-colors"
                            title="View school"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
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
    </div>
  );
}
