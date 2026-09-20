'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { formatCurrency, listPaymentsForObligation } from './shared';
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

/** Student payment history — mirrors portal-web's StudentPaymentHistoryPanel
 * (same right-hand panel, obligation summary block and payment list).
 *
 * Portal's version offers a per-payment reversal control; this one deliberately
 * does not. The generic collection API rejects updates to an existing payment
 * ("append-only") and no reversal use-case is wired up on desktop, so the
 * button would be a control that cannot do what it says.
 *
 * The obligation summary is read from the row the caller already resolved
 * rather than refetched — desktop has no single-obligation endpoint, and the
 * table's numbers come from the same fee_obligations rows the panel would
 * re-read. */
export function PaymentHistoryPanel({ student, currency, onClose }: {
  student: EnrichedStudent | null;
  currency: string;
  onClose: () => void;
}) {
  const [payments, setPayments] = useState<SchoolAdminRecord[] | null>(null);
  const obligationId = student?.obligationId ?? null;

  useEffect(() => {
    if (!obligationId) { setPayments(null); return; }
    let cancelled = false;
    setPayments(null);
    void listPaymentsForObligation(obligationId).then((rows) => { if (!cancelled) setPayments(rows); });
    return () => { cancelled = true; };
  }, [obligationId]);

  // Match the Drawer component's dismissal affordances, which this panel
  // replaces: Escape closes, and the page behind it does not scroll.
  useEffect(() => {
    if (!student) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = 'unset';
    };
  }, [student, onClose]);

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
            <p className="text-xs text-slate-400">{student.admissionNumber}</p>
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
                  <div key={String(payment.id)} className="border-b border-slate-100 py-3 last:border-0">
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
                      {Boolean(payment.isReversed) && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400">
                          Reversed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
