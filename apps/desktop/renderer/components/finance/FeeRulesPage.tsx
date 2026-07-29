'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Edit, Plus, PowerOff, Trash2 } from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { Button, Drawer, Input, Textarea } from '@nemis-desktop/ui';
import { FEE_CATEGORIES, formatCurrency, human, LEVEL_LABEL, listFeeRules, parseLevels, saveFeeRule, stringifyLevels } from './shared';

const SCHOOL_LEVELS = ['PRE_PRIMARY', 'PRIMARY', 'SECONDARY'];

interface RuleForm {
  name: string;
  description: string;
  category: string;
  amount: number;
  applicableLevels: string[];
}

const emptyForm = (): RuleForm => ({ name: '', description: '', category: 'TUITION', amount: 0, applicableLevels: [] });

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

/** School-admin Fee Rules — mirrors portal-web's financial/fee-rules/page.tsx.
 * "Only rules this school owns" (institutionId is injected server-side on
 * INSTITUTION_ADMIN writes, and every fee_rules row downloaded here belongs
 * to this institution) — real CRUD against the fee_rules collection. */
export function FeeRulesPage() {
  const [rules, setRules] = useState<SchoolAdminRecord[] | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editTarget, setEditTarget] = useState<SchoolAdminRecord | null>(null);
  const [editForm, setEditForm] = useState<RuleForm>(emptyForm());
  const [batchForms, setBatchForms] = useState<RuleForm[]>([emptyForm()]);
  const [saving, setSaving] = useState(false);

  const reload = () => void listFeeRules().then(setRules);
  useEffect(() => { reload(); }, []);

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
          createdBy: String(editTarget.createdBy ?? ''),
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
            createdBy: '',
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
        <div className="flex items-center gap-4">
          <Link href="/government/school-admin/financial" className="rounded-button p-1.5 transition-colors hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">School Admin Portal</p>
            <h1 className="text-xl font-bold text-white">Fee Rules</h1>
          </div>
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
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest text-slate-400">Actions</th>
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
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${rule.isActive ? 'bg-active/10 text-active' : 'bg-slate-100 text-slate-400'}`}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rule.isActive && (
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => openEdit(rule)} title="Edit" className="rounded-button p-1.5 text-slate-400 transition-colors hover:text-secondary">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => void handleDeactivate(rule)} title="Deactivate" className="rounded-button p-1.5 text-slate-400 transition-colors hover:text-error">
                            <PowerOff className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rules !== null && rules.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <BookOpen className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                    <p className="text-sm text-slate-400">No fee rules yet.</p>
                    <p className="mt-1 text-xs text-slate-300">Create fee rules to set payment ceilings for your students.</p>
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
    </div>
  );
}
