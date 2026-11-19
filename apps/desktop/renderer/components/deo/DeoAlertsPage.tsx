'use client';

import { AlertTriangle, Bell, CheckCircle, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type { DeoAlertFilter } from '@nemis-desktop/types';
import { useDeoAlertsViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

const severityColor = (severity: string) => {
  switch (severity) {
    case 'CRITICAL':
      return { border: 'border-red-200', bg: 'bg-red-50', badge: 'bg-red-200 text-red-800', icon: 'text-red-600' };
    case 'HIGH':
      return {
        border: 'border-orange-200',
        bg: 'bg-orange-50',
        badge: 'bg-orange-200 text-orange-800',
        icon: 'text-orange-600',
      };
    case 'MEDIUM':
      return {
        border: 'border-yellow-200',
        bg: 'bg-yellow-50',
        badge: 'bg-yellow-200 text-yellow-800',
        icon: 'text-yellow-600',
      };
    default:
      return { border: 'border-blue-200', bg: 'bg-blue-50', badge: 'bg-blue-200 text-blue-800', icon: 'text-blue-600' };
  }
};

/** DEO Alerts, ported from portal-web app/government/deo/alerts/page.tsx
 * and read from this device. */
export function DeoAlertsPage() {
  const vm = useDeoAlertsViewModel();
  const state = useViewModel(vm.store, (s) => s.alerts);
  const filter = useViewModel(vm.store, (s) => s.filter);
  const page = useViewModel(vm.store, (s) => s.page);
  const resolvingAlertId = useViewModel(vm.store, (s) => s.resolvingAlertId);
  const failedAlertId = useViewModel(vm.store, (s) => s.failedAlertId);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const alerts = data?.alerts ?? [];
  const meta = data?.meta;
  const place = [data?.district?.name, data?.county?.name].filter(Boolean).join(' · ');
  const isLoading = !data && (state.status === 'idle' || state.status === 'loading');
  const error = !data && state.status === 'error';

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

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
          <h1 className="text-xl font-bold text-white">Alerts</h1>
        </div>
        {place ? (
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-widest">District</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">{place}</p>
          </div>
        ) : null}
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">System Alerts</h2>
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filter}
                onChange={(e) => {
                  void vm.setFilter(e.target.value as DeoAlertFilter);
                }}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none bg-white"
              >
                <option value="open">Open Alerts</option>
                <option value="resolved">Resolved</option>
                <option value="all">All Alerts</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="animate-pulse space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                <p className="text-gray-600 text-sm">Failed to load alerts.</p>
                <button
                  type="button"
                  onClick={() => void vm.load()}
                  className="mt-4 px-4 py-2 rounded-full text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : alerts.length > 0 ? (
              <>
                <div className="space-y-3">
                  {alerts.map((alert) => {
                    const colors = severityColor(alert.severity);
                    return (
                      <div
                        key={alert.id}
                        className={`flex items-start justify-between p-4 rounded-xl border ${colors.border} ${colors.bg} ${alert.isResolved ? 'opacity-60' : ''}`}
                      >
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Bell className={`w-4 h-4 ${colors.icon}`} />
                            <span
                              className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${colors.badge}`}
                            >
                              {alert.severity}
                            </span>
                            <span className="text-xs text-gray-400 uppercase">{alert.type.replace(/_/g, ' ')}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(alert.createdAt).toLocaleDateString()}
                            </span>
                            {alert.isResolved && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                <CheckCircle className="w-3 h-3" /> Resolved
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                          <p className="text-xs text-gray-600 mt-1">{alert.description}</p>
                          {alert.schoolName && (
                            <p className="text-xs text-gray-500 mt-1">School: {alert.schoolName}</p>
                          )}
                          {alert.resolvedAt && (
                            <p className="text-xs text-gray-400 mt-1">
                              Resolved on {new Date(alert.resolvedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        {!alert.isResolved && (
                          <div className="ml-4 flex flex-col items-end">
                            <button
                              type="button"
                              onClick={() => void vm.resolve(alert.id)}
                              disabled={resolvingAlertId !== null}
                              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-50"
                            >
                              Resolve
                            </button>
                            {failedAlertId === alert.id && (
                              <p className="text-xs text-red-600 mt-1">Couldn&apos;t resolve this alert. Try again.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {meta && meta.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <p className="text-sm text-gray-600">
                      Page {meta.page} of {meta.totalPages} ({meta.total} total)
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void vm.setPage(Math.max(1, page - 1))}
                        disabled={page <= 1}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void vm.setPage(page + 1)}
                        disabled={page >= (meta.totalPages || 1)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-gray-600 text-sm">
                  {filter === 'open' ? 'No open alerts — all clear!' : 'No alerts found.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
