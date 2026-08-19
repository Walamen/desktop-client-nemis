'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Calendar, Plus, RefreshCw, Settings } from 'lucide-react';
import { Button, Drawer, Input } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel, useAcademicYearViewModel } from '@/lib/presentation/hooks/school-admin';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { getGradingConfig, listPeriodsForTerm, PERIOD_STATUS_BADGE, periodStatus } from './shared';

const PERIOD_TYPES = [
  { value: 'REGULAR_PERIOD', label: 'Regular' },
  { value: 'FINAL_EXAM', label: 'Exam' },
  { value: 'MIDTERM_EXAM', label: 'Mid Term' },
];

const EMPTY_FORM = { name: '', type: 'REGULAR_PERIOD', startDate: '', endDate: '', weight: 100 };

/** Grading periods scoped to a term — mirrors portal-web's
 * GradingPeriodsModal, including "Auto Setup All Periods" (here computed
 * client-side from the institution's real periodsPerTerm config and the
 * term's real start/end dates, then saved one row at a time through the same
 * generic collection API used for manual create). */
export function GradingPeriodsDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const academicYear = useAcademicYearViewModel();
  const foundation = useAcademicFoundationViewModel();
  const year = useViewModel(academicYear.store, (s) => s.current);
  const terms = useViewModel(foundation.store, (s) => s.terms);

  const [selectedTermId, setSelectedTermId] = useState('');
  const [periods, setPeriods] = useState<SchoolAdminRecord[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [config, setConfig] = useState<SchoolAdminRecord | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SchoolAdminRecord | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen) return;
    void academicYear.loadCurrent();
    void getGradingConfig().then(setConfig);
  }, [isOpen, academicYear]);

  useEffect(() => {
    if (year.status === 'success' || year.status === 'refreshing') void foundation.loadTerms(year.data.id);
  }, [year, foundation]);

  const reloadPeriods = async (termId: string) => {
    setLoadingPeriods(true);
    setPeriods(await listPeriodsForTerm(termId));
    setLoadingPeriods(false);
  };

  useEffect(() => {
    if (selectedTermId) void reloadPeriods(selectedTermId);
  }, [selectedTermId]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setShowForm(false);
  };

  const startEdit = (period: SchoolAdminRecord) => {
    setEditing(period);
    setForm({
      name: String(period.name ?? ''),
      type: String(period.periodType ?? 'REGULAR_PERIOD'),
      startDate: String(period.startDate ?? '').slice(0, 10),
      endDate: String(period.endDate ?? '').slice(0, 10),
      weight: Number(period.weight ?? 100),
    });
    setShowForm(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTermId || year.status !== 'success' && year.status !== 'refreshing') return;
    const nextSequence = editing ? Number(editing.sequence) : periods.length + 1;
    await sharedBridge.saveSchoolAdminRecord({
      collection: 'grading_periods',
      record: {
        ...(editing ? { id: editing.id } : {}),
        academicYearId: year.data.id,
        termId: selectedTermId,
        name: form.name,
        code: editing ? String(editing.code) : `P${nextSequence}`,
        periodType: form.type,
        sequence: nextSequence,
        maxMarks: config?.maxMarks ?? 100,
        passingMarks: config?.passingMarks ?? 50,
        weight: form.weight,
        startDate: form.startDate,
        endDate: form.endDate,
        isActive: true,
      },
    });
    resetForm();
    await reloadPeriods(selectedTermId);
  };

  const remove = async (period: SchoolAdminRecord) => {
    if (!window.confirm('Are you sure you want to delete this period?')) return;
    await sharedBridge.deleteSchoolAdminRecord({ collection: 'grading_periods', id: String(period.id) });
    await reloadPeriods(selectedTermId);
  };

  const autoSetup = async () => {
    if (!config || (year.status !== 'success' && year.status !== 'refreshing') || !selectedTermId) return;
    const term = (terms.status === 'success' || terms.status === 'refreshing')
      ? terms.data.find((t) => t.id === selectedTermId)
      : undefined;
    if (!term) return;
    setSettingUp(true);
    try {
      const start = new Date(term.startDate).getTime();
      const end = new Date(term.endDate).getTime();
      const count = Math.max(1, Number(config.periodsPerTerm ?? 1));
      const span = Math.max(1, Math.floor((end - start) / count));
      const dayMs = 24 * 60 * 60 * 1000;
      for (let i = 0; i < count; i += 1) {
        const periodStart = new Date(start + i * span);
        const periodEnd = new Date(i === count - 1 ? end : start + (i + 1) * span - dayMs);
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'grading_periods',
          record: {
            academicYearId: year.data.id,
            termId: selectedTermId,
            name: `Period ${i + 1}`,
            code: `P${periods.length + i + 1}`,
            periodType: 'REGULAR_PERIOD',
            sequence: periods.length + i + 1,
            maxMarks: config.maxMarks ?? 100,
            passingMarks: config.passingMarks ?? 50,
            weight: Math.round(100 / count),
            startDate: periodStart.toISOString().slice(0, 10),
            endDate: periodEnd.toISOString().slice(0, 10),
            isActive: true,
          },
        });
      }
      await reloadPeriods(selectedTermId);
    } finally {
      setSettingUp(false);
    }
  };

  const termOptions = terms.status === 'success' || terms.status === 'refreshing' ? terms.data : [];

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Grading Periods Management" size="lg">
      <div className="space-y-6 pb-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Select Term</h3>
            <button
              type="button"
              onClick={() => void autoSetup()}
              disabled={settingUp || !config || !selectedTermId}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${settingUp ? 'animate-spin' : ''}`} />
              {settingUp ? 'Setting up…' : 'Auto Setup All Periods'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {termOptions.map((term) => (
              <button
                key={term.id}
                type="button"
                onClick={() => setSelectedTermId(term.id)}
                className={`rounded-lg border px-4 py-2 text-left transition-colors ${
                  selectedTermId === term.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-sky-700" />
                  <div>
                    <p className="font-medium text-slate-900">{term.name}</p>
                    <p className="text-sm text-slate-500">
                      {new Date(term.startDate).toLocaleDateString()} – {new Date(term.endDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </button>
            ))}
            {termOptions.length === 0 && (
              <p className="text-sm text-slate-400">No terms configured for the current academic year.</p>
            )}
          </div>
        </div>

        {selectedTermId && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Periods</h3>
              <Button
                size="sm"
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Period
              </Button>
            </div>

            {showForm && (
              <form onSubmit={(e) => void submit(e)} className="mb-6 space-y-4 rounded-lg bg-slate-50 p-4">
                <h4 className="font-medium text-slate-900">{editing ? 'Edit Period' : 'Create New Period'}</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Period Name"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <label className="text-sm font-medium text-slate-700">
                    Type
                    <select
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                      className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      {PERIOD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Start Date"
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                  <Input
                    label="End Date"
                    type="date"
                    required
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                  <Input
                    label="Weight (%)"
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={form.weight}
                    onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    {editing ? 'Update' : 'Create'} Period
                  </Button>
                </div>
              </form>
            )}

            {loadingPeriods ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
              </div>
            ) : periods.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                <Calendar className="mx-auto mb-4 h-12 w-12 text-slate-300" />
                <p>No periods found for this term.</p>
                <p className="text-sm">Click &ldquo;Add Period&rdquo; or use &ldquo;Auto Setup All Periods&rdquo; above.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {periods.map((period) => {
                  const status = periodStatus(String(period.startDate), String(period.endDate));
                  return (
                    <div
                      key={String(period.id)}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-3 w-3 rounded-full ${
                            status === 'Active' ? 'bg-green-500' : status === 'Completed' ? 'bg-gray-400' : 'bg-blue-500'
                          }`}
                        />
                        <div>
                          <div className="mb-1 flex items-center gap-2">
                            <h4 className="font-medium text-slate-900">{String(period.name)}</h4>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PERIOD_STATUS_BADGE[status]}`}>
                              {status}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">
                            {new Date(String(period.startDate)).toLocaleDateString()} –{' '}
                            {new Date(String(period.endDate)).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(period)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(period)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
