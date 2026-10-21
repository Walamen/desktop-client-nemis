'use client';

import { useEffect, useState } from 'react';
import type { ElementType } from 'react';
import { Card, Input, Spinner, Button } from '@nemis-desktop/ui';
import { Plus, Edit, Trash2, LogIn, LogOut, CheckCircle, XCircle, Upload, Download, Search } from 'lucide-react';
import { useCountyAuditViewModel } from '@/lib/presentation/hooks/county';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

// portal-web lib/auditActionMapper.tsx
const ACTION_ICON: Record<string, ElementType> = {
  CREATE: Plus,
  UPDATE: Edit,
  DELETE: Trash2,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  APPROVE: CheckCircle,
  REJECT: XCircle,
  EXPORT: Upload,
  IMPORT: Download,
};
const ACTION_COLOR: Record<string, string> = {
  CREATE: 'text-green-600',
  UPDATE: 'text-blue-600',
  DELETE: 'text-red-600',
  LOGIN: 'text-purple-600',
  LOGOUT: 'text-gray-600',
  APPROVE: 'text-green-600',
  REJECT: 'text-red-600',
  EXPORT: 'text-orange-600',
  IMPORT: 'text-indigo-600',
};

const ICONS = {
  total:
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  today: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  week: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  synced: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
};

function StatIcon({ path, className }: { path: string; className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function relativeTime(iso: string | null) {
  if (!iso) return 'Never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Port of portal-web components/county/AuditSection.tsx + government/county/
 * audit/page.tsx, read from this device: the County Admin's own actions and
 * their county's DEOs and School Admins, last 12 months. Works offline; each
 * sync brings it up to date. */
export function CountyAuditPage() {
  const vm = useCountyAuditViewModel();
  const state = useViewModel(vm.store, (s) => s);
  const connectivity = useConnectivityStore();
  const lastSyncAt = useViewModel(connectivity.store, (s) => s.lastSyncAt);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');

  // Search waits for a pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useRevalidateOnSync(() => {
    void vm.load({ search, action: filterAction, entityType: filterEntityType });
  }, [search, filterAction, filterEntityType]);

  const stats = state.stats.status === 'success' || state.stats.status === 'refreshing' ? state.stats.data : null;
  const statsLoading = state.stats.status === 'idle' || state.stats.status === 'loading';
  const stat = (value: number | undefined) => (statsLoading ? '...' : value || 0);

  const rows = state.items;
  const isLoading = state.status === 'idle' || state.status === 'loading';

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="px-6 py-6">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h3 className="text-lg font-heading font-semibold text-neutral-dark mb-2">Audit Trail</h3>
            <p className="text-body text-gray-600">Real-time monitoring of all system activities within your county</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-small text-gray-600 mb-1">Total Actions</p>
                  <p className="text-h3 font-bold text-neutral-dark">{stat(stats?.total)}</p>
                  <p className="text-xs text-gray-400">Last 12 months</p>
                </div>
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <StatIcon path={ICONS.total} className="w-5 h-5 text-primary" />
                </div>
              </div>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-small text-gray-600 mb-1">Today</p>
                  <p className="text-h3 font-bold text-primary">{stat(stats?.today)}</p>
                </div>
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <StatIcon path={ICONS.today} className="w-5 h-5 text-primary" />
                </div>
              </div>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-small text-gray-600 mb-1">This Week</p>
                  <p className="text-h3 font-bold text-success">{stat(stats?.week)}</p>
                </div>
                <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
                  <StatIcon path={ICONS.week} className="w-5 h-5 text-success" />
                </div>
              </div>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-small text-gray-600 mb-1">Last Synced</p>
                  <p className="text-h3 font-bold text-accent">{relativeTime(lastSyncAt)}</p>
                </div>
                <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
                  <StatIcon path={ICONS.synced} className="w-5 h-5 text-accent" />
                </div>
              </div>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Search"
                placeholder="Search by user, action, or entity..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                icon={<Search className="w-5 h-5 text-gray-400" />}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Action Type</label>
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">All Actions</option>
                  {(stats?.actions ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Entity Type</label>
                <select
                  value={filterEntityType}
                  onChange={(e) => setFilterEntityType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">All Entities</option>
                  {(stats?.entityTypes ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* Audit Timeline */}
          <Card title="Activity Timeline">
            {state.status === 'error' ? (
              <div className="text-center py-12">
                <p className="text-red-600">Error loading audit logs. Please try again later.</p>
              </div>
            ) : isLoading ? (
              <div className="text-center py-12">
                <Spinner size="lg" />
                <p className="mt-4 text-gray-600">Loading audit logs...</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">No audit logs found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actor</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rows.map((log) => {
                      const IconComponent = ACTION_ICON[log.action] ?? Plus;
                      const colorClass = ACTION_COLOR[log.action] ?? 'text-gray-600';
                      return (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(log.timestamp)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <IconComponent className={`w-4 h-4 ${colorClass}`} />
                              <span className="text-sm font-medium text-gray-900">
                                {log.actionLabel} {log.entityLabel}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{log.actorName}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-primary/10 text-primary">
                              {log.scope}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {state.hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="secondary" size="sm" loading={state.loadingMore} onClick={() => void vm.loadMore()}>
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
