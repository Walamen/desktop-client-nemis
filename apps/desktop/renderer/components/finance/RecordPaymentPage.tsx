'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, MinusCircle, Plus, Search, Shield, XCircle,
} from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { Drawer, Input } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { schoolAdminBridge } from '@/services/nemis-bridge/school-admin';
import {
  computeFeeRuleSummary, formatCurrency, getOrCreateObligation, gradeToLevel, listFeeRules, listObligationsForRule,
  listPaymentsForObligation, OBLIGATION_STATUS_CONFIG, PAYMENT_METHODS, parseLevels, recordPayment,
} from './shared';

const PAGE_SIZE = 20;

interface EnrichedStudent {
  id: string;
  name: string;
  admissionNumber: string;
  gradeLevel: string | null;
  level: string | null;
  rule: SchoolAdminRecord | null;
  obligationId: string | null;
  status: string | null;
  totalPaid: number;
  balance: number;
  requiredAmount: number;
}

function StatusBadge({ status }: { status: string | null }) {
  const cfg = status ? OBLIGATION_STATUS_CONFIG[status] : null;
  if (!cfg) return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400">Not started</span>;
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cfg.className}`}>{cfg.label}</span>;
}

function PaymentModal({ student, currency, academicYearId, termId, onClose, onSuccess }: {
  student: EnrichedStudent; currency: string; academicYearId: string; termId: string; onClose: () => void; onSuccess: () => void;
}) {
  const rule = student.rule!;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]['value']>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const maxAmount = student.balance > 0 ? student.balance : Number(rule.amount);
  const needsRef = method === 'BANK_TRANSFER' || method === 'MOBILE_MONEY' || method === 'CHEQUE';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const value = parseFloat(amount);
    if (Number.isNaN(value) || value <= 0) return setError('Enter a valid amount.');
    if (value > maxAmount + 0.001) return setError(`Amount exceeds remaining balance of ${formatCurrency(maxAmount, currency)}.`);
    if (needsRef && !reference.trim()) return setError('Reference is required for this payment method.');
    setSaving(true);
    try {
      const obligation = await getOrCreateObligation({
        studentId: student.id, feeRuleId: String(rule.id),
        academicYearId, termId,
        requiredAmount: Number(rule.amount),
      });
      await recordPayment({ obligationId: String(obligation.id), studentId: student.id, amount: value, method, reference: reference || undefined, notes: notes || undefined });
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to record payment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/60 p-4">
      <div className="w-full max-w-sm border border-slate-300 bg-white">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">Record Payment</p>
          <h2 className="text-base font-bold text-primary">{student.name}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{student.admissionNumber}</p>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 py-5">
          {error && <div className="border border-error/30 bg-error/10 px-4 py-2.5 text-xs text-error">{error}</div>}
          <div className="flex items-center gap-2 border border-pending/30 bg-pending/10 px-4 py-2.5">
            <Shield className="h-3.5 w-3.5 shrink-0 text-pending" />
            <p className="text-xs text-pending">
              Fee ceiling: <span className="font-bold">{formatCurrency(Number(rule.amount), currency)}</span>
              {student.totalPaid > 0 && <span className="ml-1">· {formatCurrency(maxAmount, currency)} remaining</span>}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Amount" type="number" step="0.01" min="0.01" max={maxAmount} value={amount}
                onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v) && v > maxAmount) return; setAmount(e.target.value); }}
                placeholder="0.00" required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Method <span className="text-error">*</span></label>
              <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="w-full rounded-button border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary">
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          {needsRef && (
            <Input
              label="Reference" value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction / cheque reference" required
            />
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional note"
              className="w-full rounded-button border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-button border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-button bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-400 disabled:opacity-50">
              {saving ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HistoryDrawer({ obligationId, student, currency, onClose }: {
  obligationId: string | null; student: { name: string; admissionNumber: string } | null; currency: string; onClose: () => void;
}) {
  const [payments, setPayments] = useState<SchoolAdminRecord[] | null>(null);
  useEffect(() => {
    if (!obligationId) { setPayments(null); return; }
    setPayments(null);
    void listPaymentsForObligation(obligationId).then(setPayments);
  }, [obligationId]);

  return (
    <Drawer isOpen={obligationId !== null} onClose={onClose} title="Payment History" size="sm">
      {student && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{student.name}</p>
            <p className="text-xs text-slate-400">{student.admissionNumber}</p>
          </div>
          {payments === null ? (
            <div className="h-16 animate-pulse rounded bg-slate-100" />
          ) : payments.length === 0 ? (
            <p className="text-sm text-slate-400">No payments recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <div key={String(payment.id)} className={`py-3 ${payment.isReversed ? 'text-slate-400 line-through opacity-60' : ''}`}>
                  <p className="text-sm font-semibold text-slate-800">{formatCurrency(Number(payment.amount), currency)}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{String(payment.method).replaceAll('_', ' ')}{payment.reference ? ` · ${String(payment.reference)}` : ''}</p>
                  <p className="text-xs text-slate-400">{new Date(String(payment.paidAt)).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/** School-admin Record Payment — mirrors portal-web's financial/record-payment/page.tsx.
 * Obligation summaries, obligation get-or-create, and payment recording all
 * run against the real fee_obligations/fee_payments collections; recording a
 * payment automatically rolls into the obligation's totalPaid/status
 * server-side (SchoolAdminModuleService's fee_payments save branch), so no
 * separate balance update is needed here. Payment "reversal" from web isn't
 * reproduced — the generic collection API explicitly rejects updates to an
 * existing payment ("append-only"), and no reversal use-case is wired up, so
 * offering that control would be dishonest about what actually happens. */
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
  const [payingStudent, setPayingStudent] = useState<EnrichedStudent | null>(null);
  const [historyObligationId, setHistoryObligationId] = useState<string | null>(null);
  const [historyStudent, setHistoryStudent] = useState<{ name: string; admissionNumber: string } | null>(null);

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

  const rule = (rules ?? []).find((r) => String(r.id) === selectedRuleId) ?? null;
  const currency = String(rule?.currency ?? 'LRD');
  const classes = classesState.status === 'success' || classesState.status === 'refreshing' ? classesState.data : [];
  const selectedClassName = selectedClassId !== 'all' ? classes.find((c) => c.id === selectedClassId)?.name ?? null : null;

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
    setHistoryObligationId(s.obligationId);
    setHistoryStudent({ name: s.name, admissionNumber: s.admissionNumber });
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

      <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
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

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Total</p>
            <p className="mt-2 text-4xl font-bold text-slate-900">{summary.totalStudents}</p>
          </div>
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Outstanding</p>
            <p className="mt-2 text-4xl font-bold text-error">{summary.outstandingCount + summary.partialCount}</p>
          </div>
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Paid</p>
            <p className="mt-2 text-4xl font-bold text-active">{summary.paidCount}</p>
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
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${tab === value ? 'bg-white/20 text-white' : value === 'outstanding' ? 'bg-error/10 text-error' : value === 'partial' ? 'bg-pending/10 text-pending' : 'bg-active/10 text-active'}`}>
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

        {!students ? (
          <div className="flex justify-center border border-slate-300 bg-white p-12">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
          </div>
        ) : rules !== null && rules.length === 0 ? (
          <div className="border border-slate-300 bg-white p-12 text-center text-sm text-slate-400">No fee rules apply to your school yet.</div>
        ) : rowsForTab.length === 0 ? (
          <div className="border border-slate-300 bg-white p-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-active/40" />
            <p className="font-medium text-slate-600">{search || selectedClassId !== 'all' ? 'No students match your search' : `No ${tab} students on this page`}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rowsForTab.map((s) => (
              <div key={s.id} className={`flex items-center justify-between gap-3 border border-slate-200 border-l-[3px] bg-white px-4 py-3 ${s.status ? (s.status === 'PARTIALLY_PAID' ? 'border-l-pending' : s.status === 'PAID_IN_FULL' || s.status === 'WAIVED' ? 'border-l-active' : 'border-l-error') : 'border-l-slate-300'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">{s.name}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {s.admissionNumber}
                    {selectedClassName && <span className="ml-1.5">· {selectedClassName}</span>}
                    {s.rule && <span className="ml-1.5 font-medium text-pending">· max {formatCurrency(Number(s.rule.amount), currency)}</span>}
                  </p>
                  {s.status !== 'PAID_IN_FULL' && s.status !== null && (
                    <p className="mt-0.5 text-xs text-slate-400">{formatCurrency(s.balance, currency)} remaining</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => openHistory(s)} disabled={!s.obligationId} title="View payment history" className="rounded-button p-2 text-slate-400 transition-colors hover:bg-secondary-50 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-30">
                    <Clock className="h-4 w-4" />
                  </button>
                  {s.status !== 'PAID_IN_FULL' && s.rule ? (
                    <button onClick={() => setPayingStudent(s)} className="flex items-center gap-1 rounded-button bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-400">
                      <Plus className="h-3 w-3" /> Record
                    </button>
                  ) : s.status === 'PAID_IN_FULL' ? (
                    <div className="text-right">
                      <p className="text-sm font-semibold text-active">{formatCurrency(s.totalPaid, currency)}</p>
                    </div>
                  ) : !s.rule ? (
                    <span className="text-xs italic text-slate-400">Payment threshold not set</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {students && totalPages > 1 && (
          <div className="flex items-center justify-between border border-slate-300 bg-white px-5 py-3">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="flex items-center gap-1.5 rounded-button border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-secondary hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <p className="text-sm text-slate-500">
              Page <span className="font-semibold text-slate-900">{page}</span> of <span className="font-semibold text-slate-900">{totalPages}</span>
              <span className="ml-1.5 text-slate-400">({students.total} students)</span>
            </p>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex items-center gap-1.5 rounded-button border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-secondary hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {payingStudent && payingStudent.rule && (term.status === 'success' || term.status === 'refreshing') && (
        <PaymentModal
          student={payingStudent}
          currency={currency}
          academicYearId={term.data.academicYearId}
          termId={term.data.id}
          onClose={() => setPayingStudent(null)}
          onSuccess={() => {
            setPayingStudent(null);
            void listObligationsForRule(selectedRuleId).then(setObligations);
          }}
        />
      )}

      <HistoryDrawer obligationId={historyObligationId} student={historyStudent} currency={currency} onClose={() => { setHistoryObligationId(null); setHistoryStudent(null); }} />
    </div>
  );
}
