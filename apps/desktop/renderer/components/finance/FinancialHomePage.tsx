'use client';

import { useState } from 'react';
import { BookOpen, Edit, Info, Plus, PowerOff, Trash2 } from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { Button, Drawer, Input, Textarea } from '@nemis-desktop/ui';
import {
  computeFeeRuleSummary,
  FEE_CATEGORIES,
  formatCurrency,
  human,
  LEVEL_LABEL,
  listFeeObligations,
  listFeeRules,
  parseLevels,
  saveFeeRule,
  stringifyLevels,
  type FeeRuleSummary,
} from './shared';
import { BulkAssignDrawer } from './BulkAssignDrawer';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

const SCHOOL_LEVELS = ['PRE_PRIMARY', 'PRIMARY', 'SECONDARY'];

interface RuleForm {
  name: string;
  description: string;
  category: string;
  amount: number;
  applicableLevels: string[];
}

const emptyForm = (): RuleForm => ({ name: '', description: '', category: 'TUITION', amount: 0, applicableLevels: [] });

/** Click-toggle popover — portal-web uses Radix's Popover here, which the
 * desktop renderer doesn't bundle. */
function IssueBillHelp() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-label="What is Issue Bill?"
        onClick={() => setOpen((v) => !v)}
        className="p-0.5 text-slate-300 transition-colors hover:text-secondary"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-[280px] border border-slate-300 bg-white p-4 text-left text-xs font-normal normal-case tracking-normal text-slate-600 shadow-lg">
          <p className="mb-1 font-bold text-slate-900">Issue Bill</p>
          <p className="mb-3">Creates a fee record for every student in the selected grade or class, so the system knows who owes fees this term.</p>
          <p className="mb-1 font-bold text-slate-900">When to run it</p>
          <ul className="list-inside list-disc space-y-1">
            <li>At the start of each term, before recording any payments</li>
            <li>After enrolling new students mid-term &mdash; existing records are skipped automatically, so it&apos;s safe to run more than once</li>
          </ul>
        </div>
      )}
    </span>
  );
}

/** Per-rule collection progress. Portal-web reads this from the server's
 * fee-rule summary endpoint; desktop has none, so the math is computed
 * client-side from the fee_obligations rows the parent loads once. */
function CollectionCell({ rule, summary, loading }: {
  rule: SchoolAdminRecord;
  summary: FeeRuleSummary | undefined;
  loading: boolean;
}) {
  if (!rule.isActive) return <span className="text-xs text-slate-300">&mdash;</span>;
  if (loading) return <div className="h-1.5 w-28 animate-pulse rounded bg-slate-100" />;
  if (!summary || summary.totalStudents === 0) return <span className="text-xs text-slate-400">No obligation data yet.</span>;

  const currency = String(rule.currency ?? 'LRD');
  const collectionRate = summary.totalRequired > 0 ? Math.min(Math.round((summary.totalCollected / summary.totalRequired) * 100), 100) : 0;

  return (
    <div className="min-w-[9rem] space-y-1.5">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{formatCurrency(summary.totalCollected, currency)}</span>
        <span className="font-semibold text-slate-700">{collectionRate}%</span>
      </div>
      <div className="h-1.5 overflow-hidden bg-slate-100">
        <div className="h-full bg-secondary/50 transition-all" style={{ width: `${collectionRate}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 text-xs font-semibold text-error" title="Outstanding"><span className="h-1.5 w-1.5 bg-error" />{summary.outstandingCount}</span>
        <span className="flex items-center gap-1 text-xs font-semibold text-pending" title="Partial"><span className="h-1.5 w-1.5 bg-pending" />{summary.partialCount}</span>
        <span className="flex items-center gap-1 text-xs font-semibold text-active" title="Paid"><span className="h-1.5 w-1.5 bg-active" />{summary.paidCount}</span>
      </div>
    </div>
  );
}

function RuleFormFields({ form, onChange, onToggleLevel }: {
  form: RuleForm;
  onChange: (patch: Partial<RuleForm>) => void;
  onToggleLevel: (level: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Input label="Rule Name" value={form.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Annual Tuition Fee" />
      <Textarea label="Description (optional)" value={form.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Explain the purpose of this fee…" rows={2} />
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-slate-700">Category</label>
          <select value={form.category} onChange={(e) => onChange({ category: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm">
            {FEE_CATEGORIES.map((c) => <option key={c} value={c}>{human(c)}</option>)}
          </select>
        </div>
        <div className="w-36">
          <Input label="Amount (LRD)" type="number" value={String(form.amount)} onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })} placeholder="0" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Applies To <span className="ml-1 text-xs font-normal text-slate-400">(leave blank = all levels)</span></p>
        <div className="flex flex-wrap gap-1.5">
          {SCHOOL_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onToggleLevel(level)}
              className={`rounded-button border px-2.5 py-1 text-xs transition-colors ${
                form.applicableLevels.includes(level) ? 'border-secondary bg-secondary text-white' : 'border-slate-300 text-slate-600 hover:border-secondary hover:text-secondary'
              }`}
            >
              {LEVEL_LABEL[level] ?? level}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** School-admin Financial / Fees — mirrors portal-web's financial/page.tsx,
 * which folded the former standalone fee-rules screen into this one: the rule
 * table now carries the per-rule collection progress and the "Issue Bill"
 * action alongside full CRUD.
 *
 * "Only rules this school owns" (institutionId is injected server-side on
 * INSTITUTION_ADMIN writes, and every fee_rules row downloaded here belongs
 * to this institution) — real CRUD against the fee_rules collection, and
 * every number is computed from the real, writable fee_rules /
 * fee_obligations collections (no server-side summary endpoint exists on
 * desktop, so the collection math happens client-side, the same approach
 * used for Academic Grading's window stats). */
export function FinancialHomePage() {
  const [rules, setRules] = useState<SchoolAdminRecord[] | null>(null);
  const [summaries, setSummaries] = useState<Map<string, FeeRuleSummary> | null>(null);
  const [prepareRule, setPrepareRule] = useState<SchoolAdminRecord | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editTarget, setEditTarget] = useState<SchoolAdminRecord | null>(null);
  const [editForm, setEditForm] = useState<RuleForm>(emptyForm());
  const [batchForms, setBatchForms] = useState<RuleForm[]>([emptyForm()]);
  const [saving, setSaving] = useState(false);

  /** One pass over fee_obligations for the whole table — the collection API
   * has no per-rule filter, so a summary load per row would re-download the
   * same page of obligations once per fee rule. */
  const reload = () => {
    void listFeeRules().then(setRules);
    void listFeeObligations().then((obligations) => {
      const byRule = new Map<string, SchoolAdminRecord[]>();
      for (const obligation of obligations) {
        const key = String(obligation.feeRuleId ?? '');
        const bucket = byRule.get(key);
        if (bucket) bucket.push(obligation);
        else byRule.set(key, [obligation]);
      }
      setSummaries(new Map([...byRule].map(([id, rows]) => [id, computeFeeRuleSummary(rows)])));
    });
  };

  useRevalidateOnSync(() => { reload(); }, []);

  const openCreate = () => {
    setEditTarget(null);
    setBatchForms([emptyForm()]);
    setShowDrawer(true);
  };

  const openEdit = (rule: SchoolAdminRecord) => {
    setEditTarget(rule);
    setEditForm({
      name: String(rule.name ?? ''),
      description: String(rule.description ?? ''),
      category: String(rule.category ?? 'TUITION'),
      amount: Number(rule.amount ?? 0),
      applicableLevels: parseLevels(rule.applicableLevels),
    });
    setShowDrawer(true);
  };

  const addRow = () => setBatchForms((prev) => [...prev, emptyForm()]);
  const removeRow = (i: number) => setBatchForms((prev) => prev.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<RuleForm>) => setBatchForms((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const toggleRowLevel = (i: number, level: string) => setBatchForms((prev) => prev.map((f, idx) => {
    if (idx !== i) return f;
    return { ...f, applicableLevels: f.applicableLevels.includes(level) ? f.applicableLevels.filter((l) => l !== level) : [...f.applicableLevels, level] };
  }));
  const toggleEditLevel = (level: string) => setEditForm((prev) => ({
    ...prev,
    applicableLevels: prev.applicableLevels.includes(level) ? prev.applicableLevels.filter((l) => l !== level) : [...prev.applicableLevels, level],
  }));

  const isBatchValid = batchForms.every((f) => f.name.trim() && f.amount > 0);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (editTarget) {
        await saveFeeRule({
          id: editTarget.id!,
          name: editForm.name,
          description: editForm.description || null,
          category: editForm.category,
          amount: editForm.amount,
          currency: String(editTarget.currency ?? 'LRD'),
          applicableLevels: stringifyLevels(editForm.applicableLevels),
          isMandatory: true,
          isActive: true,
        });
      } else {
        for (const form of batchForms) {
          await saveFeeRule({
            name: form.name,
            description: form.description || null,
            category: form.category,
            amount: form.amount,
            currency: 'LRD',
            applicableLevels: stringifyLevels(form.applicableLevels),
            isMandatory: true,
            isActive: true,
          });
        }
      }
      setShowDrawer(false);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (rule: SchoolAdminRecord) => {
    await saveFeeRule({ id: rule.id!, isActive: false });
    reload();
  };

  const activeRules = (rules ?? []).filter((r) => r.isActive);
  const inactiveRules = (rules ?? []).filter((r) => !r.isActive);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-primary px-6 py-5 text-white">
        <div>
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">School Admin Portal</p>
          <h1 className="text-xl font-bold text-white">Financial / Fees</h1>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-button bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-secondary-600">
          <Plus className="h-4 w-4" /> New Rule
        </button>
      </div>

      <div className="space-y-5 px-6 py-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Active Rules</p>
            <p className="mt-2 text-4xl font-bold text-active">{activeRules.length}</p>
          </div>
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Inactive</p>
            <p className="mt-2 text-4xl font-bold text-slate-400">{inactiveRules.length}</p>
          </div>
          <div className="rounded-card border border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Scope</p>
            <p className="mt-3 text-sm font-bold text-secondary">This School Only</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">Rule Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">Category</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest text-slate-400">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">Grade Levels</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">Collection</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    Actions
                    <IssueBillHelp />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(rules ?? []).map((rule) => {
                const levels = parseLevels(rule.applicableLevels);
                return (
                  <tr key={String(rule.id)} className={`hover:bg-slate-50 ${!rule.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{String(rule.name)}</p>
                      {rule.description && <p className="mt-0.5 text-xs text-slate-400">{String(rule.description)}</p>}
                    </td>
                    <td className="px-4 py-3"><span className="rounded bg-secondary-50 px-2 py-0.5 text-xs font-medium text-secondary-700">{human(String(rule.category))}</span></td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(Number(rule.amount), String(rule.currency ?? 'LRD'))}</td>
                    <td className="px-4 py-3">
                      {levels.length === 0 ? <span className="text-xs text-slate-400">All Levels</span> : (
                        <div className="flex flex-wrap gap-1">
                          {levels.slice(0, 4).map((l) => <span key={l} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{LEVEL_LABEL[l] ?? l}</span>)}
                          {levels.length > 4 && <span className="text-xs text-slate-400">+{levels.length - 4}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <CollectionCell rule={rule} summary={summaries?.get(String(rule.id))} loading={summaries === null} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${rule.isActive ? 'bg-active/10 text-active' : 'bg-slate-100 text-slate-400'}`}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {rule.isActive && (
                          <>
                            <button type="button" onClick={() => setPrepareRule(rule)} className="rounded-button border border-slate-300 px-3 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-white">
                              Issue Bill
                            </button>
                            <button type="button" onClick={() => openEdit(rule)} title="Edit" className="rounded-button p-1.5 text-slate-400 transition-colors hover:text-secondary">
                              <Edit className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => void handleDeactivate(rule)} title="Deactivate" className="rounded-button p-1.5 text-slate-400 transition-colors hover:text-error">
                              <PowerOff className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rules !== null && rules.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <BookOpen className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                    <p className="text-sm text-slate-400">No fee rules yet.</p>
                    <p className="mt-1 text-xs text-slate-300">Create fee rules to set payment ceilings for your students.</p>
                  </td>
                </tr>
              )}
              {rules === null && (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <div className="mx-auto h-4 w-48 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        title={editTarget ? 'Edit Fee Rule' : 'Add Fee Rules'}
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setShowDrawer(false)}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || (editTarget ? !editForm.name.trim() || editForm.amount <= 0 : !isBatchValid)}>
            {saving ? 'Saving…' : editTarget ? 'Update Rule' : `Save ${batchForms.length > 1 ? `${batchForms.length} Rules` : 'Rule'}`}
          </Button>
        </>}
      >
        {editTarget ? (
          <RuleFormFields form={editForm} onChange={(patch) => setEditForm((p) => ({ ...p, ...patch }))} onToggleLevel={toggleEditLevel} />
        ) : (
          <div className="space-y-4">
            {batchForms.map((f, i) => (
              <div key={i} className="relative space-y-4 border border-slate-300 p-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Rule {i + 1}</span>
                  {batchForms.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} title="Remove" className="rounded p-1 text-slate-300 transition-colors hover:text-error">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <RuleFormFields form={f} onChange={(patch) => updateRow(i, patch)} onToggleLevel={(level) => toggleRowLevel(i, level)} />
              </div>
            ))}
            <button type="button" onClick={addRow} className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-slate-300 py-3 text-sm text-slate-400 transition-colors hover:border-secondary hover:text-secondary">
              <Plus className="h-4 w-4" />
              Add Another Rule
            </button>
          </div>
        )}
      </Drawer>

      <BulkAssignDrawer feeRule={prepareRule} onClose={() => setPrepareRule(null)} onDone={reload} />
    </div>
  );
}
