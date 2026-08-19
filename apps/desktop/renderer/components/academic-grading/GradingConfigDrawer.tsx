'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Drawer, Input } from '@nemis-desktop/ui';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { getGradingConfig, parseGradeScale, stringifyGradeScale, type GradeScaleItem } from './shared';

/** Institution-wide grading configuration — mirrors portal-web's
 * GradingSetupModal. One row per institution in `institution_grading_configs`
 * (real, mutable SQLite table); the policy checkboxes web keeps commented out
 * (hasExams/allowLateSubmission/requireAdminApproval) are preserved with the
 * same defaults rather than exposed, matching web's own scope. */
export function GradingConfigDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [existing, setExisting] = useState<SchoolAdminRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxMarks, setMaxMarks] = useState(100);
  const [passingMarks, setPassingMarks] = useState(50);
  const [periodsPerTerm, setPeriodsPerTerm] = useState(3);
  const [termsPerYear, setTermsPerYear] = useState(2);
  const [scale, setScale] = useState<GradeScaleItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    void getGradingConfig().then((record) => {
      setExisting(record);
      setMaxMarks(Number(record?.maxMarks ?? 100));
      setPassingMarks(Number(record?.passingMarks ?? 50));
      setPeriodsPerTerm(Number(record?.periodsPerTerm ?? 3));
      setTermsPerYear(Number(record?.termsPerYear ?? 2));
      setScale(parseGradeScale(record?.gradeScale));
      setLoading(false);
    });
  }, [isOpen]);

  const addRow = () => setScale((rows) => [...rows, { letter: '', description: '', min: 0, max: 0, gradePoint: 0 }]);
  const removeRow = (index: number) => setScale((rows) => rows.filter((_, i) => i !== index));
  const updateRow = (index: number, patch: Partial<GradeScaleItem>) =>
    setScale((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await sharedBridge.saveSchoolAdminRecord({
        collection: 'institution_grading_configs',
        record: {
          ...(existing?.id ? { id: existing.id } : {}),
          maxMarks,
          passingMarks,
          periodsPerTerm,
          termsPerYear,
          hasExams: existing?.hasExams ?? true,
          calculationMethod: existing?.calculationMethod ?? 'AVERAGE',
          gradeScale: stringifyGradeScale(scale),
          allowLateSubmission: existing?.allowLateSubmission ?? false,
          lateSubmissionPenalty: existing?.lateSubmissionPenalty ?? 0,
          requireAdminApproval: existing?.requireAdminApproval ?? true,
        },
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Grading System Setup" size="lg">
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-6 pb-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Maximum Marks"
                type="number"
                required
                value={maxMarks}
                onChange={(e) => setMaxMarks(Number(e.target.value))}
              />
              <Input
                label="Passing Marks"
                type="number"
                required
                value={passingMarks}
                onChange={(e) => setPassingMarks(Number(e.target.value))}
              />
              <Input
                label="Periods per Term"
                type="number"
                required
                value={periodsPerTerm}
                onChange={(e) => setPeriodsPerTerm(Number(e.target.value))}
              />
              <Input
                label="Terms per Year"
                type="number"
                required
                value={termsPerYear}
                onChange={(e) => setTermsPerYear(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">Grade Scale</h3>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Grade Scale
              </button>
            </div>

            {scale.length === 0 ? (
              <p className="rounded-lg border-2 border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
                No grade bands defined yet. Click &ldquo;Add Grade Scale&rdquo; to create your grading scale.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[70px_1fr_70px_70px_80px_36px] gap-2 px-1">
                  {['Letter', 'Description', 'Min %', 'Max %', 'GPA', ''].map((h) => (
                    <div key={h} className="text-xs font-semibold uppercase text-slate-500">
                      {h}
                    </div>
                  ))}
                </div>
                {scale.map((row, index) => (
                  <div key={index} className="grid grid-cols-[70px_1fr_70px_70px_80px_36px] items-center gap-2">
                    <Input
                      value={row.letter}
                      onChange={(e) => updateRow(index, { letter: e.target.value })}
                      maxLength={3}
                      required
                      placeholder="A"
                    />
                    <Input
                      value={row.description}
                      onChange={(e) => updateRow(index, { description: e.target.value })}
                      required
                      placeholder="e.g. Excellent"
                    />
                    <Input
                      type="number"
                      value={row.min}
                      onChange={(e) => updateRow(index, { min: Number(e.target.value) })}
                      min={0}
                      max={100}
                      required
                    />
                    <Input
                      type="number"
                      value={row.max}
                      onChange={(e) => updateRow(index, { max: Number(e.target.value) })}
                      min={0}
                      max={100}
                      required
                    />
                    <Input
                      type="number"
                      step={0.1}
                      value={row.gradePoint}
                      onChange={(e) => updateRow(index, { gradePoint: Number(e.target.value) })}
                      min={0}
                      max={4}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          <div className="flex gap-4">
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" fullWidth disabled={saving}>
              {saving ? 'Saving…' : 'Save Configuration'}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
