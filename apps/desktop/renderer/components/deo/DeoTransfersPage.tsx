'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRightLeft, Building2, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Spinner } from '@nemis-desktop/ui';
import { formatNemisId } from '@nemis-desktop/shared';
import type { DeoTransfer } from '@nemis-desktop/types';
import {
  DIRECTION_TABS,
  TRANSFER_STATUS_TABS,
  directionLabel,
  filterTransfers,
  transferTabCounts,
  waitingLabel,
  type DirectionTab,
  type TransferStatusTab,
} from '@nemis-desktop/presentation';
import { useDeoTransfersViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { TransferStatusChip } from '@/components/transfers/TransferStatusChip';

function fmt(level: string): string {
  return level.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function pillClass(active: boolean): string {
  return `px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
    active ? 'bg-secondary text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-400'
  }`;
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      {children}
    </div>
  );
}

function Banner({ pending, lapsed }: { pending: number; lapsed: number }) {
  const parts = [pending > 0 ? `${pending} pending` : null, lapsed > 0 ? `${lapsed} lapsed` : null].filter(Boolean);
  return (
    <div className="bg-slate-900 text-white px-6 py-5">
      <div className="flex items-center gap-3 mb-1">
        <ArrowRightLeft className="w-5 h-5 text-slate-400" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">District Management</p>
      </div>
      <h1 className="text-xl font-bold">Student Transfer Requests</h1>
      {parts.length > 0 ? <p className="text-xs text-amber-400 mt-1">{parts.join(' · ')}</p> : null}
    </div>
  );
}

function statusLine(transfer: DeoTransfer, now: Date): string | null {
  if (!transfer.awaitingSchool) return null;
  if (transfer.lapsed) return `Lapsed — ${transfer.awaitingSchool.name} can complete or withdraw`;
  return `Awaiting ${transfer.awaitingSchool.name} · ${waitingLabel(transfer.createdAt, now)}`;
}

/** DEO Transfers, oversight only: schools decide, the DEO watches. Ported
 * from portal-web app/government/deo/transfers/page.tsx and read from this
 * device. Rules: docs/superpowers/specs/2026-11-17-deo-transfers-design.md. */
export function DeoTransfersPage() {
  const vm = useDeoTransfersViewModel();
  const state = useViewModel(vm.store, (s) => s.transfers);
  const [statusTab, setStatusTab] = useState<TransferStatusTab>('Pending');
  const [directionTab, setDirectionTab] = useState<DirectionTab>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const transfers = useMemo(() => data?.transfers ?? [], [data]);
  const counts = useMemo(() => transferTabCounts(transfers, directionTab), [transfers, directionTab]);
  const visible = useMemo(() => filterTransfers(transfers, statusTab, directionTab), [transfers, statusTab, directionTab]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        <Banner pending={0} lapsed={0} />
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        <Banner pending={0} lapsed={0} />
        <div className="px-6 py-6 max-w-3xl mx-auto">
          <div className="bg-white border border-gray-300 rounded-2xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" aria-hidden />
            <p className="text-sm text-slate-500">Failed to load transfer requests.</p>
            <button type="button" onClick={() => void vm.load()} className="mt-2 text-sm underline text-red-700">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (data && data.districtId === null) {
    return (
      <div className="min-h-screen bg-slate-100 font-['Sora'] flex items-center justify-center">
        <p className="text-sm text-slate-500">No district assigned to your account.</p>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <Banner pending={data?.summary.pending ?? 0} lapsed={data?.summary.lapsed ?? 0} />

      <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
        <div className="flex gap-2 flex-wrap">
          {TRANSFER_STATUS_TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setStatusTab(tab)} className={pillClass(statusTab === tab)}>
              {tab} ({counts[tab]})
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {DIRECTION_TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setDirectionTab(tab)} className={pillClass(directionTab === tab)}>
              {tab}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="bg-white border border-gray-300 rounded-2xl p-6 text-center">
            <Clock className="w-8 h-8 text-slate-200 mx-auto mb-3" aria-hidden />
            <p className="text-sm text-slate-400">No transfer requests match these filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((tr) => {
              const isExpanded = expandedId === tr.id;
              const line = statusLine(tr, now);
              return (
                <div key={tr.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : tr.id)}
                    aria-expanded={isExpanded}
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-slate-900">{tr.studentName}</p>
                        <TransferStatusChip status={tr.status} lapsed={tr.lapsed} ours={false} />
                        <span className="text-[11px] text-slate-500">{directionLabel(tr.direction)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Building2 className="w-3 h-3 shrink-0" aria-hidden />
                        <span className="truncate">{tr.fromSchool.name}</span>
                        <span className="text-slate-300 shrink-0">→</span>
                        <span className="truncate font-medium text-slate-700">{tr.toSchool.name}</span>
                      </div>
                      {line ? <p className="text-xs text-amber-700 mt-1">{line}</p> : null}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 ml-3" aria-hidden />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-3" aria-hidden />
                    )}
                  </button>

                  {isExpanded ? (
                    <div className="px-6 pb-5 pt-0 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <Field label="Student">
                          <p className="text-sm font-medium text-slate-800">{tr.studentName}</p>
                          <p className="text-xs text-slate-500">
                            {tr.studentNemisId ? formatNemisId(tr.studentNemisId) : 'No NEMIS ID'}
                          </p>
                        </Field>
                        <Field label="Requested">
                          <p className="text-sm text-slate-700">{new Date(tr.createdAt).toLocaleDateString()}</p>
                          {tr.requestedDate ? (
                            <p className="text-xs text-slate-500">
                              Transfer by: {new Date(tr.requestedDate).toLocaleDateString()}
                            </p>
                          ) : null}
                        </Field>
                        {tr.requestedGrade ? (
                          <Field label="Requested Grade">
                            <p className="text-sm font-medium text-slate-800">{fmt(tr.requestedGrade)}</p>
                          </Field>
                        ) : null}
                        <Field label="Asked by">
                          <p className="text-sm text-slate-700">
                            {tr.initiatedBy === 'RECEIVING_SCHOOL' ? 'Receiving school' : 'Sending school'}
                          </p>
                        </Field>
                        <Field label="Reason" wide>
                          <p className="text-sm text-slate-700">{tr.reason}</p>
                        </Field>
                        {tr.reviewNotes ? (
                          <Field label="Review Notes" wide>
                            <p className="text-sm text-slate-700 italic">{tr.reviewNotes}</p>
                            {tr.reviewedAt ? (
                              <p className="text-xs text-slate-500">
                                Reviewed {new Date(tr.reviewedAt).toLocaleDateString()}
                              </p>
                            ) : null}
                          </Field>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-400 text-center">Schools decide transfers. This page is for district oversight.</p>
      </div>
    </div>
  );
}
