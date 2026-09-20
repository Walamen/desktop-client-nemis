'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, MinusCircle, Search, XCircle } from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { Input } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { schoolAdminBridge } from '@/services/nemis-bridge/school-admin';
import {
  computeFeeRuleSummary, formatCurrency, gradeToLevel, listFeeRules, listObligationsForRule, parseLevels,
} from './shared';
import { PaymentRow, type EnrichedStudent } from './PaymentRow';
import { PaymentHistoryPanel } from './PaymentHistoryPanel';

const PAGE_SIZE = 20;

const TH = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap';
const TH_RIGHT = `${TH} text-right`;

/** School-admin Record Payment — mirrors portal-web's financial/record-payment/page.tsx.
 * Obligation get-or-create and payment recording run against the real
 * fee_obligations/fee_payments collections; recording a payment automatically
 * rolls into the obligation's totalPaid/status server-side
 * (SchoolAdminModuleService's fee_payments save branch), so no separate
 * balance update is needed here. Payment "reversal" from web isn't reproduced
 * — the generic collection API explicitly rejects updates to an existing
 * payment ("append-only"), and no reversal use-case is wired up, so offering
 * that control would be dishonest about what actually happens.
 *
 * Entry is per-row (see PaymentRow): amount, method and a conditional
 * reference live in the student's line and each row saves independently. */
export function RecordPaymentPage() {
  const foundation = useAcademicFoundationViewModel();
  const classesState = useViewModel(foundation.store, (s) => s.classes);
  const term = useViewModel(foundation.store, (s) => s.currentTerm);

  const [tab, setTab] = useState<'outstanding' | 'partial' | 'paid'>('outstanding');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [rules, setRules] = useState<SchoolAdminRecord[] | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [obligations, setObligations] = useState<SchoolAdminRecord[]>([]);
  const [students, setStudents] = useState<{ items: readonly { id: string; fullName: string; admissionNumber: string; gradeLevel?: string }[]; total: number } | null>(null);
  const [historyStudent, setHistoryStudent] = useState<EnrichedStudent | null>(null);

  useEffect(() => { void foundation.loadClasses(); void foundation.loadCurrentTerm(); }, [foundation]);
  useEffect(() => { void listFeeRules().then((rows) => setRules(rows.filter((r) => r.isActive))); }, []);
  useEffect(() => {
    if (rules && rules.length > 0 && !selectedRuleId) setSelectedRuleId(String(rules[0]!.id));
  }, [rules, selectedRuleId]);
  useEffect(() => { setPage(1); }, [search, selectedClassId]);
  useEffect(() => {
    if (!selectedRuleId) return;
    void listObligationsForRule(selectedRuleId).then(setObligations);
  }, [selectedRuleId]);
  useEffect(() => {
    void schoolAdminBridge.listStudents({
      keyword: search || undefined,
      classId: selectedClassId !== 'all' ? selectedClassId : undefined,
      isActive: true, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, sort: 'name',
    }).then((result) => setStudents({ items: result.items, total: result.total }));
  }, [search, selectedClassId, page]);

  const reloadObligations = () => {
    if (!selectedRuleId) return;
    void listObligationsForRule(selectedRuleId).then(setObligations);
  };

  const rule = (rules ?? []).find((r) => String(r.id) === selectedRuleId) ?? null;
  const currency = String(rule?.currency ?? 'LRD');
  const classes = classesState.status === 'success' || classesState.status === 'refreshing' ? classesState.data : [];
  const termReady = term.status === 'success' || term.status === 'refreshing';

  const enrichedStudents: EnrichedStudent[] = useMemo(() => {
    const items = students?.items ?? [];
    if (items.length === 0) return [];
    const byStudent = new Map(obligations.map((o) => [String(o.studentId), o]));
    const levels = rule ? parseLevels(rule.applicableLevels) : [];
    return items
      .filter((s) => {
        if (!rule || levels.length === 0) return true;
        const level = gradeToLevel(s.gradeLevel);
        return level ? levels.includes(level) : false;
      })
      .map((s) => {
        const obligation = byStudent.get(s.id);
        return {
          id: s.id,
          name: s.fullName,
          admissionNumber: s.admissionNumber,
          gradeLevel: s.gradeLevel ?? null,
          level: gradeToLevel(s.gradeLevel),
          rule,
          obligationId: obligation?.id != null ? String(obligation.id) : null,
          status: obligation ? String(obligation.status) : null,
          totalPaid: Number(obligation?.totalPaid ?? 0),
          balance: Number(rule?.amount ?? 0) - Number(obligation?.totalPaid ?? 0),
          requiredAmount: Number(obligation?.requiredAmount ?? rule?.amount ?? 0),
        };
      });
  }, [students, obligations, rule]);

  const outstanding = enrichedStudents.filter((s) => s.status === 'OUTSTANDING' || s.status === null);
  const partial = enrichedStudents.filter((s) => s.status === 'PARTIALLY_PAID');
  const paid = enrichedStudents.filter((s) => s.status === 'PAID_IN_FULL' || s.status === 'WAIVED');

  const summary = useMemo(() => computeFeeRuleSummary(obligations), [obligations]);
  const totalPages = students ? Math.max(1, Math.ceil(students.total / PAGE_SIZE)) : 1;

  const rowsForTab = tab === 'outstanding' ? outstanding : tab === 'partial' ? partial : paid;

  const openHistory = (s: EnrichedStudent) => {
    if (!s.obligationId) return;
    setHistoryStudent(s);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center gap-4 bg-primary px-6 py-5 text-white">
        <Link href="/government/school-admin/financial" className="rounded-button p-1.5 transition-colors hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">Financial</p>
          <h1 className="text-xl font-bold">Fee Payments</h1>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        {rules && rules.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {rules.map((r) => (
              <button
                key={String(r.id)} type="button" onClick={() => setSelectedRuleId(String(r.id))}
                className={`flex items-center gap-2 rounded-button border px-4 py-2 text-sm font-semibold transition-colors ${
                  selectedRuleId === String(r.id) ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-secondary hover:text-secondary'
                }`}
              >
                <span>{String(r.name)}</span>
                <span className={selectedRuleId === String(r.id) ? 'text-slate-300' : 'text-slate-400'}>{formatCurrency(Number(r.amount), String(r.currency ?? 'LRD'))}</span>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Total</p>
            <p className="mt-2 text-4xl font-bold tabular-nums text-slate-900">{summary.totalStudents}</p>
          </div>
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Outstanding</p>
            <p className="mt-2 text-4xl font-bold tabular-nums text-error">{summary.outstandingCount + summary.partialCount}</p>
          </div>
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Paid</p>
            <p className="mt-2 text-4xl font-bold tabular-nums text-active">{summary.paidCount}</p>
          </div>
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Collected</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-secondary">{formatCurrency(summary.totalCollected, currency)}</p>
            <p className="mt-1 text-xs text-slate-400">of {formatCurrency(summary.totalRequired, currency)} required</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex shrink-0 items-center gap-1 rounded-button border border-slate-300 bg-white p-1">
            {([
              ['outstanding', XCircle, outstanding.length],
              ['partial', MinusCircle, partial.length],
              ['paid', CheckCircle2, paid.length],
            ] as const).map(([value, Icon, count]) => (
              <button
                key={value} type="button" onClick={() => setTab(value)}
                className={`flex items-center gap-1.5 rounded-button px-4 py-2 text-sm font-medium transition-colors ${tab === value ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {value === 'outstanding' ? 'Outstanding' : value === 'partial' ? 'Partial' : 'Paid in Full'}
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${tab === value ? 'bg-white/20 text-white' : value === 'outstanding' ? 'bg-error/10 text-error' : value === 'partial' ? 'bg-pending/10 text-pending' : 'bg-active/10 text-active'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex-1">
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or admission number…"
              icon={<Search className="h-4 w-4 text-slate-400" />}
            />
          </div>
          <div className="relative shrink-0">
            <select
              value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}
              className="appearance-none rounded-button border border-slate-300 bg-white py-2 pl-4 pr-9 text-sm text-slate-700 outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
            >
              <option value="all">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` — ${c.section}` : ''}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        {!termReady && (
          <div className="rounded-card border border-pending/30 bg-pending/10 px-4 py-2.5 text-xs text-pending">
            Loading the current term — payment entry is disabled until it resolves.
          </div>
        )}

        {!students ? (
          <div className="flex justify-center rounded-lg border border-slate-300 bg-white p-12">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
          </div>
        ) : rules !== null && rules.length === 0 ? (
          <div className="rounded-lg border border-slate-300 bg-white p-12 text-center text-sm text-slate-400">No fee rules apply to your school yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className={`${TH_RIGHT} w-10`}>#</th>
                  <th className={`${TH} w-[26%] min-w-[200px]`}>Student</th>
                  <th className={TH}>Grade</th>
                  <th className={TH}>Status</th>
                  <th className={TH_RIGHT}>Fee</th>
                  <th className={TH_RIGHT}>Paid</th>
                  <th className={TH_RIGHT}>Balance</th>
                  <th className={TH_RIGHT}>Amount</th>
                  <th className={TH}>Method</th>
                  <th className={TH_RIGHT}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rowsForTab.map((s, i) => (
                  <PaymentRow
                    key={s.id}
                    index={(page - 1) * PAGE_SIZE + i + 1}
                    student={s}
                    currency={currency}
                    academicYearId={termReady ? term.data.academicYearId : ''}
                    termId={termReady ? term.data.id : ''}
                    canRecord={termReady}
                    onSaved={reloadObligations}
                    onHistory={openHistory}
                  />
                ))}
                {rowsForTab.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center">
                      <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-active/40" />
                      <p className="font-medium text-slate-600">
                        {search || selectedClassId !== 'all' ? 'No students match your search' : `No ${tab} students on this page`}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {students && totalPages > 1 && (
          <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-5 py-3">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-1.5 rounded-button border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-secondary hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <p className="text-sm text-slate-500">
              Page <span className="font-semibold tabular-nums text-slate-900">{page}</span> of <span className="font-semibold tabular-nums text-slate-900">{totalPages}</span>
              <span className="ml-1.5 tabular-nums text-slate-400">({students.total} students)</span>
            </p>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex items-center gap-1.5 rounded-button border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-secondary hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <PaymentHistoryPanel student={historyStudent} currency={currency} onClose={() => setHistoryStudent(null)} />
    </div>
  );
}
