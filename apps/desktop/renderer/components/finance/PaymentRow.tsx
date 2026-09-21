'use client';

import { useState, type KeyboardEvent } from 'react';
import { Clock } from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { formatNemisId } from '@nemis-desktop/shared';
import { formatCurrency, getOrCreateObligation, OBLIGATION_STATUS_CONFIG, PAYMENT_METHODS, recordPayment } from './shared';
import { capAmountInput, methodRequiresReference, validatePaymentDraft, type PaymentDraftError } from './payment-draft';

export interface EnrichedStudent {
  id: string;
  name: string;
  nemisId: string;
  gradeLevel: string | null;
  level: string | null;
  rule: SchoolAdminRecord | null;
  obligationId: string | null;
  status: string | null;
  totalPaid: number;
  balance: number;
  requiredAmount: number;
}

export function StatusBadge({ status }: { status: string | null }) {
  const cfg = status ? OBLIGATION_STATUS_CONFIG[status] : null;
  if (!cfg) return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400">Not started</span>;
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cfg.className}`}>{cfg.label}</span>;
}

const errorMessage = (error: PaymentDraftError, currency: string): string => {
  switch (error.code) {
    case 'INVALID_AMOUNT':
      return 'Enter a valid amount.';
    case 'EXCEEDS_BALANCE':
      return `Amount exceeds remaining balance of ${formatCurrency(error.maxAmount, currency)}.`;
    case 'REFERENCE_REQUIRED':
      return 'Reference is required for this payment method.';
  }
};

const CELL = 'px-3 py-2 align-middle';
const MONEY = `${CELL} text-right tabular-nums`;

/** One student's line on the Record Payment table. Owns its own draft entry,
 * its own validation error and its own write, so a failure on one row never
 * touches the others. The obligation is created lazily inside `handleSave` —
 * merely rendering a row must not create fee obligations for students nobody
 * has paid for.
 *
 * Reference has no column of its own: it is blank for cash, which is most
 * rows, so it sits under the method select and appears only for the methods
 * the server demands one for (see RecordFeePaymentDto's ValidateIf). */
export function PaymentRow({ index, student, currency, academicYearId, termId, canRecord, onSaved, onHistory }: {
  index: number;
  student: EnrichedStudent;
  currency: string;
  academicYearId: string;
  termId: string;
  canRecord: boolean;
  onSaved: () => void;
  onHistory: (student: EnrichedStudent) => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>('CASH');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const rule = student.rule;
  const isSettled = student.status === 'PAID_IN_FULL' || student.status === 'WAIVED';
  const isPayable = Boolean(rule) && !isSettled;
  const maxAmount = student.balance > 0 ? student.balance : Number(rule?.amount ?? 0);
  const needsRef = methodRequiresReference(method);

  const handleSave = async () => {
    // Payments are append-only, so a double submit is not an edit — it is a
    // second fee_payments row (and, for a student with no obligation yet, a
    // second fee_obligations row that hides half the money). The Save button
    // is disabled while saving, but Enter is not a button press, so the guard
    // has to live here too.
    if (saving || !rule || !canRecord) return;
    const problem = validatePaymentDraft({ amount, method, reference }, maxAmount);
    if (problem) {
      setError(errorMessage(problem, currency));
      return;
    }
    setError('');
    setSaving(true);
    try {
      const obligation = await getOrCreateObligation({
        studentId: student.id,
        feeRuleId: String(rule.id),
        academicYearId,
        termId,
        requiredAmount: Number(rule.amount),
      });
      await recordPayment({
        obligationId: String(obligation.id),
        studentId: student.id,
        amount: parseFloat(amount),
        method,
        reference: reference || undefined,
      });
      setAmount('');
      setReference('');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to record payment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (saving) return;
    void handleSave();
  };

  const entryColumns = () => {
    if (!rule) {
      return (
        <td className={CELL} colSpan={2}>
          <span className="text-xs italic text-slate-400">Payment threshold not set</span>
        </td>
      );
    }
    if (isSettled) {
      return (
        <td className={MONEY} colSpan={2}>
          <span className="text-sm font-semibold text-active">{formatCurrency(student.totalPaid, currency)}</span>
        </td>
      );
    }
    return (
      <>
        <td className={`${CELL} text-right`}>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={maxAmount}
            value={amount}
            onChange={(e) => {
              const next = capAmountInput(e.target.value, maxAmount);
              if (next === null) return;
              setAmount(next);
            }}
            onKeyDown={handleKeyDown}
            placeholder="0.00"
            aria-label={`Payment amount for ${student.name}`}
            className="w-24 rounded-button border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
          />
        </td>
        <td className={CELL}>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            aria-label={`Payment method for ${student.name}`}
            className="w-32 rounded-button border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
          >
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {needsRef && (
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Reference *"
              aria-label={`Payment reference for ${student.name}`}
              className="mt-1.5 w-32 rounded-button border border-pending/50 px-2 py-1.5 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
            />
          )}
        </td>
      </>
    );
  };

  const accent = isSettled ? 'border-l-active' : student.status === 'PARTIALLY_PAID' ? 'border-l-pending' : student.status ? 'border-l-error' : 'border-l-slate-300';

  return (
    <>
      <tr className={`border-l-[3px] ${accent} odd:bg-white even:bg-slate-50/60 hover:bg-secondary-50/40`}>
        <td className={`${CELL} text-right text-xs tabular-nums text-slate-300`}>{index}</td>
        <td className={CELL}>
          <p className="text-sm font-medium text-slate-900">{student.name}</p>
          <p className="mt-0.5 text-xs tabular-nums text-slate-400">{formatNemisId(student.nemisId)}</p>
        </td>
        <td className={`${CELL} text-xs text-slate-500`}>
          {student.gradeLevel ? student.gradeLevel.replaceAll('_', ' ') : <span className="text-slate-300">&mdash;</span>}
        </td>
        <td className={CELL}><StatusBadge status={student.status} /></td>
        <td className={`${MONEY} text-slate-500`}>{rule ? formatCurrency(student.requiredAmount, currency) : <span className="text-slate-300">&mdash;</span>}</td>
        <td className={`${MONEY} text-slate-500`}>{formatCurrency(student.totalPaid, currency)}</td>
        <td className={`${MONEY} font-semibold ${isSettled ? 'text-active' : student.balance > 0 ? 'text-error' : 'text-slate-500'}`}>
          {rule ? formatCurrency(Math.max(student.balance, 0), currency) : <span className="font-normal text-slate-300">&mdash;</span>}
        </td>
        {entryColumns()}
        <td className={`${CELL} whitespace-nowrap text-right`}>
          {isPayable && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !canRecord || !amount}
              className="mr-1 rounded-button bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onHistory(student)}
            disabled={!student.obligationId}
            title="View payment history"
            className="rounded-button p-1.5 align-middle text-slate-400 transition-colors hover:bg-secondary-50 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Clock className="h-4 w-4" />
          </button>
        </td>
      </tr>
      {error && (
        <tr className={`border-l-[3px] ${accent} bg-error/5`}>
          <td />
          <td colSpan={9} className="px-3 pb-2 text-xs text-error">{error}</td>
        </tr>
      )}
    </>
  );
}
