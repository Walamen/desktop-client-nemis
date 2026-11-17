'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CircleDollarSign, Clock3, TriangleAlert } from 'lucide-react';
import { Spinner } from '@nemis-desktop/ui';
import type { DeoFinanceResult, DeoFinanceStatus } from '@nemis-desktop/types';
import {
  FINANCE_FILTERS,
  auditEntityLabel,
  filterFinanceSchools,
  financeStatusCounts,
  flaggedRateBarClass,
  formatAuditTime,
  formatCompactLrd,
  formatLrd,
  lastPaymentLabel,
  type FinanceFilter,
} from '@nemis-desktop/presentation';
import { useDeoFinanceViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

type FinanceTab = 'overview' | 'flagged' | 'audit';

const TABS: { id: FinanceTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'flagged', label: 'Flagged Activity' },
  { id: 'audit', label: 'Audit Logs' },
];

const detailHref = (id: string) => `/government/deo/schools/details?id=${encodeURIComponent(id)}`;

const STATUS_CHIP: Record<DeoFinanceStatus, string> = {
  'On Track': 'bg-active/10 text-active',
  'At Risk': 'bg-pending/10 text-pending',
  Behind: 'bg-orange-50 text-orange-700',
  'No Data': 'bg-slate-100 text-slate-600',
};

const STATUS_BAR: Record<DeoFinanceStatus, string> = {
  'On Track': 'bg-active',
  'At Risk': 'bg-pending',
  Behind: 'bg-orange-500',
  'No Data': 'bg-slate-300',
};

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const width = (rate: number) => `${Math.min(Math.max(rate, 0), 100)}%`;

const TH = 'px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider';
const TH_RIGHT = 'px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider';

function Banner({ place }: { place: string }) {
  return (
    <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal · Finance</p>
        <h1 className="text-xl font-bold text-white">Finance Monitoring</h1>
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

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="bg-white border border-slate-300 rounded-2xl p-12 text-center">
      <AlertTriangle className="w-10 h-10 text-error mx-auto mb-3" aria-hidden />
      <p className="text-sm text-slate-600">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 text-sm underline text-error">
        Retry
      </button>
    </div>
  );
}

function Bar({ label, rate, valueClass, barClass }: { label: string; rate: number; valueClass: string; barClass: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
        <span>{label}</span>
        <span className={valueClass}>{rate}%</span>
      </div>
      <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: width(rate) }} />
      </div>
    </div>
  );
}

function Overview({ data }: { data: DeoFinanceResult }) {
  const [filter, setFilter] = useState<FinanceFilter>('ALL');
  const counts = useMemo(() => financeStatusCounts(data.schools), [data.schools]);
  const visible = useMemo(() => filterFinanceSchools(data.schools, filter), [data.schools, filter]);
  const { summary, trend } = data;
  const maxTrend = Math.max(...trend.map((item) => item.amount), 0);
  const kpis = [
    { label: 'District Allocation', value: formatCompactLrd(summary.totalAllocation) },
    { label: 'Collected', value: formatCompactLrd(summary.totalCollected) },
    { label: 'Collection Rate', value: `${summary.complianceRate}%` },
    { label: 'Outstanding', value: formatCompactLrd(summary.totalOutstanding) },
  ];

  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Current academic year</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-300 rounded-2xl p-6">
            <div className="text-3xl font-bold text-gray-900">{kpi.value}</div>
            <p className="text-sm font-medium text-gray-500 mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-300 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">Budget Utilization</h2>
          <div className="space-y-5">
            <Bar label="Collection Rate" rate={summary.complianceRate} valueClass="text-active" barClass="bg-active" />
            <Bar
              label="Coverage Across Schools"
              rate={percent(summary.schoolsBilling, data.schools.length)}
              valueClass="text-secondary"
              barClass="bg-secondary"
            />
            <Bar
              label="Outstanding Exposure"
              rate={percent(summary.totalOutstanding, summary.totalAllocation)}
              valueClass="text-pending"
              barClass="bg-pending"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {[
                { label: 'Schools Tracked', value: data.schools.length },
                { label: 'Schools Billing', value: summary.schoolsBilling },
                { label: 'Behind Target', value: summary.schoolsBehind },
              ].map((tile) => (
                <div key={tile.label} className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{tile.label}</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{tile.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-2xl p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h2 className="text-lg font-bold text-gray-900">Monthly Collection Trend</h2>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-active">
              <CircleDollarSign className="w-4 h-4" aria-hidden />
              Payment totals on this device
            </div>
          </div>
          {trend.every((item) => item.amount === 0) ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-500">
              No completed payments recorded in the last six months.
            </div>
          ) : (
            <div className="h-64 flex items-end gap-4">
              {trend.map((item) => (
                <div key={item.period} className="flex-1 h-full flex flex-col items-center justify-end gap-3">
                  <div className="text-xs font-semibold text-gray-500">{formatCompactLrd(item.amount)}</div>
                  <div
                    className="w-full max-w-[68px] rounded-t-2xl bg-pending"
                    style={{ height: `${Math.max(maxTrend > 0 ? (item.amount / maxTrend) * 170 : 8, 8)}px` }}
                  />
                  <div className="text-xs font-medium text-gray-500">{item.period}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-300 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {FINANCE_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                filter === status ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status} ({counts[status]})
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="p-12 text-center">
            <Clock3 className="w-12 h-12 text-gray-400 mx-auto mb-3" aria-hidden />
            <p className="text-sm text-gray-600">No schools matched the current finance filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['School', 'Principal', 'Allocation', 'Collected', 'Outstanding', 'Compliance', 'Students', 'Last Payment', 'Status', 'Action'].map(
                    (heading) => (
                      <th key={heading} className={TH}>
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visible.map((school) => (
                  <tr key={school.schoolId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-gray-900">{school.schoolName}</div>
                      <div className="text-xs text-gray-500">{school.schoolCode}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{school.principalName}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatLrd(school.allocation)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-active">{formatLrd(school.collected)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-pending">{formatLrd(school.outstanding)}</td>
                    <td className="px-6 py-4">
                      <div className="min-w-[160px]">
                        <div className="flex items-center justify-between text-xs font-semibold text-gray-600 mb-2">
                          <span>{school.complianceRate}%</span>
                          <span>{formatLrd(school.collected)}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${STATUS_BAR[school.status]}`}
                            style={{ width: width(school.complianceRate) }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{school.studentCount}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{lastPaymentLabel(school.lastPaymentAt)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CHIP[school.status]}`}>
                        {school.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={detailHref(school.schoolId)}
                        className="inline-flex items-center justify-center rounded-full bg-secondary/10 px-4 py-2 text-sm font-semibold text-secondary hover:bg-secondary/20 transition-colors"
                      >
                        View School
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function FlaggedActivity({ data }: { data: DeoFinanceResult }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 flex items-start gap-2">
        <TriangleAlert className="w-5 h-5 mt-0.5 flex-shrink-0" aria-hidden />
        <span>Schools with a collection rate below 30% are flagged for follow-up.</span>
      </div>
      <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={TH}>School</th>
              <th className={TH_RIGHT}>Expected</th>
              <th className={TH_RIGHT}>Collected</th>
              <th className={TH_RIGHT}>Outstanding</th>
              <th className={TH}>Rate</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.flagged.map((school) => (
              <tr key={school.schoolId} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-sm font-semibold text-gray-900">{school.schoolName}</div>
                  <div className="text-xs text-gray-500">{school.schoolCode}</div>
                </td>
                <td className="px-6 py-4 text-right text-gray-700">{formatLrd(school.expected)}</td>
                <td className="px-6 py-4 text-right font-medium text-active">{formatLrd(school.collected)}</td>
                <td className="px-6 py-4 text-right font-medium text-pending">{formatLrd(school.outstanding)}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${flaggedRateBarClass(school.collectionRate)}`}
                        style={{ width: width(school.collectionRate) }}
                      />
                    </div>
                    <span className="text-xs text-gray-600">{school.collectionRate}%</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {school.isFlagged ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-error/10 text-error">
                      <TriangleAlert className="w-3 h-3" aria-hidden /> Flagged
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-gray-100 text-gray-500">
                      Monitor
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {data.flagged.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">
                  No schools with concerning activity
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditLogs() {
  const vm = useDeoFinanceViewModel();
  const state = useViewModel(vm.store, (s) => s.audit);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (state.status === 'error') {
    return <ErrorBox message="Failed to load the finance audit entries." onRetry={() => void vm.loadAudit()} />;
  }
  const entries = state.status === 'empty' ? [] : state.data;
  return (
    <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className={TH}>Time</th>
            <th className={TH}>User</th>
            <th className={TH}>Action</th>
            <th className={TH}>Entity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 text-xs text-gray-500">{formatAuditTime(entry.timestamp)}</td>
              <td className="px-6 py-4 text-sm text-gray-700">{entry.actorName}</td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-secondary/10 text-secondary">
                  {entry.action}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">{auditEntityLabel(entry.entityType, entry.entityId)}</td>
            </tr>
          ))}
          {entries.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">
                No finance audit entries found
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** DEO Finance Monitoring, ported from portal-web app/government/deo/finance/page.tsx
 * and read from this device. Rules: docs/superpowers/specs/2026-11-17-deo-finance-design.md. */
export function DeoFinancePage() {
  const vm = useDeoFinanceViewModel();
  const state = useViewModel(vm.store, (s) => s.finance);
  const [tab, setTab] = useState<FinanceTab>('overview');
  const [auditOpened, setAuditOpened] = useState(false);

  useRevalidateOnSync(() => {
    void vm.loadFinance();
  }, [vm]);
  // The audit entries load once the tab is first opened, then follow syncs.
  useRevalidateOnSync(() => {
    if (auditOpened) void vm.loadAudit();
  }, [vm, auditOpened]);

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;

  if (data && data.districtId === null) {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora'] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-pending mx-auto mb-3" aria-hidden />
          <p className="text-sm text-slate-600">No district assigned to your account.</p>
        </div>
      </div>
    );
  }

  const place = [data?.district?.name, data?.county?.name].filter(Boolean).join(' · ');
  const open = (next: FinanceTab) => {
    setTab(next);
    if (next === 'audit') setAuditOpened(true);
  };

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <Banner place={place} />
      <div className="px-6 py-6 space-y-5">
        <div className="border-b border-gray-200">
          <div
            role="tablist"
            aria-label="Finance views"
            className="flex gap-6 overflow-x-auto"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              const index = TABS.findIndex((item) => item.id === tab);
              const step = event.key === 'ArrowRight' ? 1 : TABS.length - 1;
              const next = TABS[(index + step) % TABS.length]!;
              open(next.id);
              document.getElementById(`finance-tab-${next.id}`)?.focus();
            }}
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                id={`finance-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                aria-controls="finance-panel"
                tabIndex={tab === item.id ? 0 : -1}
                onClick={() => open(item.id)}
                className={`pb-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === item.id ? 'text-secondary border-b-2 border-secondary' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div id="finance-panel" role="tabpanel" aria-labelledby={`finance-tab-${tab}`} className="space-y-5">
          {tab === 'audit' ? (
            <AuditLogs />
          ) : state.status === 'error' ? (
            <ErrorBox message="Failed to load district finance data." onRetry={() => void vm.loadFinance()} />
          ) : !data ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : tab === 'overview' ? (
            <Overview data={data} />
          ) : (
            <FlaggedActivity data={data} />
          )}
        </div>
      </div>
    </div>
  );
}
