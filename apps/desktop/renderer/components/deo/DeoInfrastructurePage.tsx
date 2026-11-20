'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CircleAlert,
  Clock3,
  ShieldAlert,
  Wrench,
  Eye,
  CheckCircle,
  ArrowUpCircle,
  Loader2,
} from 'lucide-react';
import { Modal, Textarea } from '@nemis-desktop/ui';
import type { DeoInfrastructureIssue } from '@nemis-desktop/types';
import { useDeoInfrastructureViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

type SeverityFilter = 'ALL' | DeoInfrastructureIssue['severity'];
type StatusFilter = 'ALL' | DeoInfrastructureIssue['status'];

const severityBadgeStyles: Record<string, string> = {
  LOW: 'bg-emerald-50 text-emerald-700',
  MEDIUM: 'bg-amber-50 text-amber-700',
  HIGH: 'bg-orange-50 text-orange-700',
  CRITICAL: 'bg-red-50 text-red-700',
};

const statusBadgeStyles: Record<string, string> = {
  OPEN: 'bg-sky-50 text-sky-700',
  UNDER_REVIEW: 'bg-violet-50 text-violet-700',
  ESCALATED: 'bg-red-50 text-red-700',
  RESOLVED: 'bg-green-50 text-green-700',
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getCategoryIcon(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes('inspection')) return ShieldAlert;
  if (normalized.includes('staff')) return Building2;
  if (normalized.includes('capacity')) return CircleAlert;
  return Wrench;
}

function getIssueCardStyle(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return 'border-red-200 bg-red-50/30';
    case 'HIGH':
      return 'border-orange-200 bg-orange-50/30';
    case 'MEDIUM':
      return 'border-amber-200 bg-amber-50/30';
    default:
      return 'border-gray-200 bg-white';
  }
}

type ActionType = 'review' | 'resolve' | 'escalate' | null;

/** DEO Infrastructure & Issues, ported from portal-web
 * app/government/deo/infrastructure/page.tsx and read from this device. */
export function DeoInfrastructurePage() {
  const vm = useDeoInfrastructureViewModel();
  const state = useViewModel(vm.store, (s) => s.infrastructure);
  const acting = useViewModel(vm.store, (s) => s.acting);
  const actionError = useViewModel(vm.store, (s) => s.actionError);

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Action modal state
  const [selectedIssue, setSelectedIssue] = useState<DeoInfrastructureIssue | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [actionComments, setActionComments] = useState('');
  const [escalationReason, setEscalationReason] = useState('');

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const place = [data?.district?.name, data?.county?.name].filter(Boolean).join(' · ');
  const isLoading = !data && (state.status === 'idle' || state.status === 'loading');
  const error = !data && state.status === 'error';

  const issues = useMemo(() => data?.issues ?? [], [data?.issues]);
  const summary = data?.summary ?? { totalIssues: 0, critical: 0, open: 0, escalated: 0 };

  const severityCounts = useMemo(
    () => ({
      ALL: issues.length,
      CRITICAL: issues.filter((issue) => issue.severity === 'CRITICAL').length,
      HIGH: issues.filter((issue) => issue.severity === 'HIGH').length,
      MEDIUM: issues.filter((issue) => issue.severity === 'MEDIUM').length,
      LOW: issues.filter((issue) => issue.severity === 'LOW').length,
    }),
    [issues],
  );

  const statusCounts = useMemo(
    () => ({
      ALL: issues.length,
      OPEN: issues.filter((issue) => issue.status === 'OPEN').length,
      UNDER_REVIEW: issues.filter((issue) => issue.status === 'UNDER_REVIEW').length,
      ESCALATED: issues.filter((issue) => issue.status === 'ESCALATED').length,
    }),
    [issues],
  );

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      const severityMatches = severityFilter === 'ALL' || issue.severity === severityFilter;
      const statusMatches = statusFilter === 'ALL' || issue.status === statusFilter;
      return severityMatches && statusMatches;
    });
  }, [issues, severityFilter, statusFilter]);

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
          <h1 className="text-xl font-bold text-white">Infrastructure &amp; Issues</h1>
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
            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
              <Wrench className="w-5 h-5 text-slate-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.totalIssues}</div>
            <p className="text-sm font-medium text-gray-500 mt-1">Total Issues</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.critical}</div>
            <p className="text-sm font-medium text-gray-500 mt-1">Critical</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
              <Clock3 className="w-5 h-5 text-slate-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.open}</div>
            <p className="text-sm font-medium text-gray-500 mt-1">Open / Under Review</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
              <ArrowUpRight className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{summary.escalated}</div>
            <p className="text-sm font-medium text-gray-500 mt-1">Escalated</p>
          </div>
        </div>

        <div className="bg-white flex justify-between rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((severity) => (
              <button
                key={severity}
                type="button"
                onClick={() => setSeverityFilter(severity)}
                className={`px-4  rounded-full text-sm font-semibold transition-colors ${
                  severityFilter === severity ? 'bg-sky-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {severity === 'ALL' ? 'All' : humanize(severity)}
                <span className="ml-2 text-xs opacity-80">{severityCounts[severity]}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {(['ALL', 'OPEN', 'UNDER_REVIEW', 'ESCALATED'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  statusFilter === status ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status === 'ALL' ? 'All' : humanize(status)}
                <span className="ml-2 text-xs opacity-80">{statusCounts[status]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-44 rounded-2xl border border-gray-200 bg-white animate-pulse" />
            ))
          ) : error ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 shadow-sm text-center">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">Failed to load infrastructure issues.</p>
              <button
                type="button"
                onClick={() => void vm.load()}
                className="mt-4 px-4 py-2 rounded-full text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 shadow-sm text-center">
              <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">No infrastructure issues matched your filters.</p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const CategoryIcon = getCategoryIcon(issue.category);

              return (
                <div
                  key={issue.id}
                  className={`rounded-2xl border p-6 shadow-sm ${getIssueCardStyle(issue.severity)}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 shadow-sm">
                        <CategoryIcon className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{issue.title}</h2>
                        <p className="text-sm text-gray-600 mt-1">
                          {issue.schoolName} · {humanize(issue.category)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${severityBadgeStyles[issue.severity]}`}
                      >
                        {humanize(issue.severity)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeStyles[issue.status]}`}
                      >
                        {humanize(issue.status)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-white/80 border border-gray-200 px-4 py-3">
                    <p className="text-sm font-medium text-gray-700">
                      Note: <span className="font-normal text-gray-600">{issue.note}</span>
                    </p>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                      <span>Reported: {formatDate(issue.reportedAt)}</span>
                      <span>{issue.schoolId ? 'School-linked issue' : 'District-level issue'}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {issue.schoolId && (
                        <Link
                          href={`/government/deo/schools/details?id=${encodeURIComponent(issue.schoolId)}`}
                          className="inline-flex items-center justify-center rounded-md bg-white border-2 border-gray px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors"
                        >
                          View School
                        </Link>
                      )}
                      {issue.status === 'OPEN' && (
                        <button
                          type="button"
                          onClick={() => openActionModal(issue, 'review')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          Review
                        </button>
                      )}
                      {(issue.status === 'OPEN' || issue.status === 'UNDER_REVIEW') && (
                        <>
                          <button
                            type="button"
                            onClick={() => openActionModal(issue, 'resolve')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-600 bg-white border border-gray-300 rounded-lg hover:bg-green-50 transition-colors"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Resolve
                          </button>
                          {(issue.severity === 'HIGH' || issue.severity === 'CRITICAL') && (
                            <button
                              type="button"
                              onClick={() => openActionModal(issue, 'escalate')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors"
                            >
                              <ArrowUpCircle className="h-4 w-4" />
                              Escalate
                            </button>
                          )}
                        </>
                      )}
                      {issue.status === 'ESCALATED' && (
                        <span className="inline-flex items-center justify-center rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
                          Escalated to County
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Action Modal */}
        <Modal
          isOpen={!!actionType}
          onClose={closeActionModal}
          title={
            actionType === 'review'
              ? 'Review Infrastructure Issue'
              : actionType === 'resolve'
                ? 'Resolve Infrastructure Issue'
                : 'Escalate to County'
          }
          footer={
            <div className="flex w-full flex-col gap-2">
              {actionError && (
                <p role="alert" className="w-full text-sm text-red-600">
                  {actionError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeActionModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleAction()}
                  disabled={acting || (actionType === 'escalate' && !escalationReason.trim())}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-sky-700 rounded-lg hover:bg-sky-800 transition-colors disabled:opacity-50"
                >
                  {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {actionType === 'review' && 'Mark as Under Review'}
                  {actionType === 'resolve' && 'Mark as Resolved'}
                  {actionType === 'escalate' && 'Escalate to County'}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {selectedIssue && <p className="text-sm text-gray-600 mb-4">{selectedIssue.title}</p>}

            {actionType === 'escalate' ? (
              <div className="space-y-2">
                <label htmlFor="escalation-reason" className="text-sm font-medium">
                  Reason for Escalation *
                </label>
                <Textarea
                  id="escalation-reason"
                  placeholder="Explain why this issue needs county-level attention..."
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  rows={4}
                  required
                />
                <p className="text-xs text-gray-500">
                  This issue will be sent to the County Education Office for immediate attention.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="comments" className="text-sm font-medium">
                  Comments (Optional)
                </label>
                <Textarea
                  id="comments"
                  placeholder={actionType === 'review' ? 'Add review notes...' : 'Add resolution details...'}
                  value={actionComments}
                  onChange={(e) => setActionComments(e.target.value)}
                  rows={4}
                />
              </div>
            )}
          </div>
        </Modal>
      </div>
    </div>
  );

  function openActionModal(issue: DeoInfrastructureIssue, action: ActionType) {
    vm.clearActionError();
    setSelectedIssue(issue);
    setActionType(action);
    setActionComments('');
    setEscalationReason('');
  }

  function closeActionModal() {
    vm.clearActionError();
    setSelectedIssue(null);
    setActionType(null);
    setActionComments('');
    setEscalationReason('');
  }

  async function handleAction() {
    if (!selectedIssue || !actionType) return;
    const text = actionType === 'escalate' ? escalationReason : actionComments || undefined;
    const ok = await vm.act(actionType, selectedIssue.id, text);
    if (ok) closeActionModal();
  }
}
