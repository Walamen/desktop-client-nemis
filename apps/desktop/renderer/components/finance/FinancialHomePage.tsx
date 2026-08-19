'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Info } from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { computeFeeRuleSummary, formatCurrency, LEVEL_LABEL, listFeeRules, listObligationsForRule, parseLevels, type FeeRuleSummary } from './shared';
import { BulkAssignDrawer } from './BulkAssignDrawer';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

function FeeRuleCard({ rule, onPrepare }: { rule: SchoolAdminRecord; onPrepare: (rule: SchoolAdminRecord) => void }) {
  const [summary, setSummary] = useState<FeeRuleSummary | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useRevalidateOnSync(() => {
    void listObligationsForRule(String(rule.id)).then((rows) => setSummary(computeFeeRuleSummary(rows)));
  }, [rule.id]);

  const currency = String(rule.currency ?? 'LRD');
  const levels = parseLevels(rule.applicableLevels);
  const collectionRate = summary && summary.totalRequired > 0 ? Math.min(Math.round((summary.totalCollected / summary.totalRequired) * 100), 100) : 0;

  if (!summary) {
    return <div className="h-36 animate-pulse border border-slate-300 bg-white p-5" />;
  }

  return (
    <div className="rounded-lg border border-slate-300 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{String(rule.name)}</p>
          <p className="mt-0.5 text-xs text-slate-400">{levels.length === 0 ? 'All Levels' : levels.map((l) => LEVEL_LABEL[l] ?? l).join(', ')}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold text-primary">{formatCurrency(Number(rule.amount), currency)}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Per Student</p>
        </div>
      </div>

      <div className="px-5 py-4">
        {summary.totalStudents === 0 ? (
          <p className="text-xs text-slate-400">No obligation data yet.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-error"><span className="h-2 w-2 bg-error" />{summary.outstandingCount} Outstanding</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-pending"><span className="h-2 w-2 bg-pending" />{summary.partialCount} Partial</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-active"><span className="h-2 w-2 bg-active" />{summary.paidCount} Paid</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{formatCurrency(summary.totalCollected, currency)} collected</span>
                <span className="font-semibold text-slate-700">{collectionRate}%</span>
              </div>
              <div className="h-1.5 overflow-hidden bg-slate-100">
                <div className="h-full bg-secondary/50 transition-all" style={{ width: `${collectionRate}%` }} />
              </div>
              <p className="text-xs text-slate-400">of {formatCurrency(summary.totalRequired, currency)} required</p>
            </div>
          </>
        )}
      </div>

      <div className="relative flex gap-2 px-5 py-3">
        <button type="button" onClick={() => onPrepare(rule)} className="flex-1 rounded-button border border-slate-300 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-white">
          Issue Bill
        </button>
        <button
          type="button"
          aria-label="What is Issue Bill?"
          onClick={() => setShowInfo((v) => !v)}
          className="rounded-button border border-slate-200 px-2.5 text-slate-400 transition-colors hover:bg-secondary-50 hover:text-secondary"
        >
          <Info className="h-4 w-4" />
        </button>
        {showInfo && (
          <div className="absolute right-5 top-full z-50 mt-1.5 w-[280px] border border-slate-300 bg-white p-4 text-xs text-slate-600 shadow-lg">
            <p className="mb-1 font-bold text-slate-900">Issue Bill</p>
            <p className="mb-3">Creates a fee record for every student in the selected grade or class, so the system knows who owes fees this term.</p>
            <p className="mb-1 font-bold text-slate-900">When to run it</p>
            <ul className="list-inside list-disc space-y-1">
              <li>At the start of each term, before recording any payments</li>
              <li>After enrolling new students mid-term — existing records are skipped automatically, so it&apos;s safe to run more than once</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** School-admin Financial / Fees home — mirrors portal-web's financial/page.tsx.
 * Every number on this page is computed from the real, writable fee_rules /
 * fee_obligations collections (no server-side summary endpoint exists on
 * desktop, so the per-rule collection/outstanding math happens client-side,
 * same approach used for Academic Grading's window stats). */
export function FinancialHomePage() {
  const [rules, setRules] = useState<SchoolAdminRecord[] | null>(null);
  const [prepareRule, setPrepareRule] = useState<SchoolAdminRecord | null>(null);

  const reload = () => void listFeeRules().then((rows) => setRules(rows.filter((r) => r.isActive)));

  useRevalidateOnSync(() => { reload(); }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-primary px-6 py-5 text-white">
        <div>
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">School Admin Portal</p>
          <h1 className="text-xl font-bold">Financial / Fees</h1>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
        {rules === null && (
          <>
            <div className="h-36 animate-pulse border border-slate-300 bg-white p-5" />
            <div className="h-36 animate-pulse border border-slate-300 bg-white p-5" />
          </>
        )}
        {rules !== null && rules.length === 0 && (
          <div className="border border-slate-300 bg-white p-5 text-center text-sm text-slate-400">No fee rules apply to your school yet.</div>
        )}
        {rules?.map((rule) => <FeeRuleCard key={String(rule.id)} rule={rule} onPrepare={setPrepareRule} />)}

        <Link
          href="/government/school-admin/financial/record-payment"
          className="flex w-full items-center justify-between rounded-button border bg-primary px-6 py-5 text-white transition-colors hover:bg-primary-400"
        >
          <div className="text-left">
            <p className="text-lg font-semibold">Manage Payments</p>
            <p className="mt-0.5 text-sm text-slate-400">Record payments · See who has paid · Filter by class</p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" />
        </Link>

        <Link
          href="/government/school-admin/financial/fee-rules"
          className="flex w-full items-center justify-between rounded-button border border-slate-300 bg-white px-6 py-5 text-slate-900 transition-colors hover:border-secondary"
        >
          <div className="flex items-center gap-4 text-left">
            <BookOpen className="h-5 w-5 shrink-0 text-secondary" />
            <div>
              <p className="text-lg font-semibold">Fee Rules</p>
              <p className="mt-0.5 text-sm text-slate-400">Set fee ceilings · Manage your school&apos;s fee rules</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" />
        </Link>
      </div>

      <BulkAssignDrawer feeRule={prepareRule} onClose={() => setPrepareRule(null)} onDone={reload} />
    </div>
  );
}
