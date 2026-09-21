'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { formatNemisId } from '@nemis-desktop/shared';
import { formatCurrency, listPaymentsForObligation, reverseFeePayment } from './shared';
import type { EnrichedStudent } from './PaymentRow';

const STATUS_LABEL: Record<string, string> = {
  OUTSTANDING: 'Outstanding',
  PARTIALLY_PAID: 'Partial',
  PAID_IN_FULL: 'Paid in Full',
  WAIVED: 'Waived',
};

const STATUS_COLOR: Record<string, string> = {
  OUTSTANDING: 'bg-red-50 text-red-500',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-500',
  PAID_IN_FULL: 'bg-emerald-50 text-emerald-600',
  WAIVED: 'bg-slate-50 text-slate-500',
};

/** Mirrors portal-web's formatDate (@nemis/utils) so both panels date payments
 * identically. */
const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

function SummaryLine({ label, value, className = 'text-slate-800' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xs font-semibold tabular-nums ${className}`}>{value}</p>
    </div>
  );
}

/** One payment's line plus its own reverse form. Owns its own open/reason/
 * submitting/error state, so a reversal in flight on one payment never
 * touches another's — mirrors PaymentRow's per-row ownership (see
 * PaymentRow.tsx). Sharing that state at the panel level let Cancel or
 * another row's toggle discard an in-flight submission's own state out from
 * under it, dropping its error silently; keeping it per-row removes that
 * class of bug instead of patching one interleaving. */
function PaymentHistoryRow({ payment, currency, onReversed }: {
  payment: SchoolAdminRecord;
  currency: string;
  onReversed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleReverse = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await reverseFeePayment({ paymentId: String(payment.id), reason: reason.trim() });
      setOpen(false);
      setReason('');
      onReversed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reverse this payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-b border-slate-100 py-3 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className={payment.isReversed ? 'opacity-40 line-through' : ''}>
          <p className="text-sm font-semibold tabular-nums text-slate-800">
            {formatCurrency(Number(payment.amount), currency)}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {String(payment.method).replaceAll('_', ' ')}
            {payment.reference ? ` · ${String(payment.reference)}` : ''}
          </p>
          <p className="text-xs text-slate-400">{formatDate(String(payment.paidAt))}</p>
        </div>
        {payment.isReversed ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400">
            Reversed
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setOpen(!open); setReason(''); setError(''); }}
            aria-label="Reverse this payment"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for reversal"
            autoFocus
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-400"
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setReason(''); setError(''); }}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleReverse()}
              disabled={submitting || !reason.trim()}
              className="flex-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs text-white hover:bg-red-600 disabled:opacity-50"
            >
              {submitting ? 'Reversing…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Student payment history — mirrors portal-web's StudentPaymentHistoryPanel
 * (same right-hand panel, obligation summary block and payment list).
 *
 * Payments are append-only and can never be edited or deleted; the only
 * correction is an audited reversal with a mandatory reason, recorded via
 * reverseFeePayment (see shared.tsx) and rendered per-row by
 * PaymentHistoryRow above.
 *
 * The obligation summary is read from the row the caller already resolved
 * rather than refetched — desktop has no single-obligation endpoint, and the
 * table's numbers come from the same fee_obligations rows the panel would
 * re-read. onReversed lets the caller refresh that table after a reversal. */
export function PaymentHistoryPanel({ student, currency, onClose, onReversed }: {
  student: EnrichedStudent | null;
  currency: string;
  onClose: () => void;
  onReversed: () => void;
}) {
  const [payments, setPayments] = useState<SchoolAdminRecord[] | null>(null);
  const obligationId = student?.obligationId ?? null;
  // Which obligation the list on screen belongs to, readable from a promise
  // that settles long after the render that started it.
  const shownObligationRef = useRef<string | null>(obligationId);

  useEffect(() => {
    shownObligationRef.current = obligationId;
    if (!obligationId) { setPayments(null); return; }
    let cancelled = false;
    setPayments(null);
    void listPaymentsForObligation(obligationId).then((rows) => { if (!cancelled) setPayments(rows); });
    return () => { cancelled = true; };
  }, [obligationId]);

  const handleRowReversed = () => {
    const requested = obligationId;
    if (requested) {
      // The same race the effect above guards with `cancelled`: this reload
      // can still be in flight when the panel moves to another student, and
      // painting its rows there would list one student's payments under
      // another's name.
      void listPaymentsForObligation(requested).then((rows) => {
        if (shownObligationRef.current === requested) setPayments(rows);
      });
    }
    onReversed();
  };

  // Match the Drawer component's dismissal affordances, which this panel
  // replaces: Escape closes, and the page behind it does not scroll.
  //
  // Keyed on whether the panel is open rather than on `student` itself: the
  // caller derives `student` from live state, so it is a fresh object on
  // every recompute and depending on it would tear down and rebuild both the
  // listener and the scroll lock on every parent render. `onClose` is stable
  // by contract — RecordPaymentPage memoizes it — so this pair changes only
  // when the panel really opens or closes.
  const isOpen = student !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!student) return null;

  const status = student.status ?? 'OUTSTANDING';
  const balance = Math.max(student.requiredAmount - student.totalPaid, 0);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">Payment History</p>
            <h2 className="text-base font-bold text-slate-900">{student.name}</h2>
            <p className="text-xs text-slate-400">{student.nemisId ? formatNemisId(student.nemisId) : '—'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment history"
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-2 border-b border-slate-100 bg-slate-50 px-6 py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">Status</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[status] ?? 'bg-slate-50 text-slate-500'}`}>
                {STATUS_LABEL[status] ?? status}
              </span>
            </div>
            <SummaryLine label="Required" value={formatCurrency(student.requiredAmount, currency)} />
            <SummaryLine label="Paid" value={formatCurrency(student.totalPaid, currency)} className="text-emerald-600" />
            <SummaryLine label="Balance" value={formatCurrency(balance, currency)} className="text-red-500" />
          </div>

          <div className="px-6 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Payments</p>
            {payments === null ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
              </div>
            ) : payments.length === 0 ? (
              <p className="text-sm text-slate-400">No payments recorded yet.</p>
            ) : (
              <div>
                {payments.map((payment) => (
                  <PaymentHistoryRow
                    key={String(payment.id)}
                    payment={payment}
                    currency={currency}
                    onReversed={handleRowReversed}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
