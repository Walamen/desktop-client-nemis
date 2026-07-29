'use client';

import { useEffect, useState } from 'react';
import { GradeLevel, type GradeLevel as GradeLevelValue, type SchoolAdminRecord } from '@nemis-desktop/types';
import { Button, Drawer } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks';
import { nemisBridge } from '@/services/nemis-bridge';
import { bulkAssignObligations, gradeToLevel, human, parseLevels, type BulkAssignResult } from './shared';

type TargetMode = 'gradeLevel' | 'class';

/** Mirrors portal-web's BulkAssignObligationsModal ("Issue Bill") — creates a
 * fee_obligations row for every matching student, idempotently skipping
 * anyone who already has one for this rule + term. */
export function BulkAssignDrawer({ feeRule, onClose, onDone }: {
  feeRule: SchoolAdminRecord | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const foundation = useAcademicFoundationViewModel();
  const classesState = useViewModel(foundation.store, (s) => s.classes);
  const term = useViewModel(foundation.store, (s) => s.currentTerm);

  const [mode, setMode] = useState<TargetMode>('gradeLevel');
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<GradeLevelValue | ''>('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkAssignResult | null>(null);

  useEffect(() => {
    if (!feeRule) return;
    setMode('gradeLevel');
    setSelectedGradeLevel('');
    setSelectedClassId('');
    setResult(null);
    void foundation.loadClasses();
    void foundation.loadCurrentTerm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeRule?.id]);

  const levels = feeRule ? parseLevels(feeRule.applicableLevels) : [];
  const relevantGradeLevels = Object.values(GradeLevel).filter((gl) => levels.length === 0 || levels.includes(gradeToLevel(gl) ?? ''));
  const allClasses = classesState.status === 'success' || classesState.status === 'refreshing' ? classesState.data : [];
  const relevantClasses = allClasses.filter((c) => c.isActive && (levels.length === 0 || levels.includes(gradeToLevel(c.gradeLevel) ?? '')));

  useEffect(() => {
    if (!selectedGradeLevel && relevantGradeLevels.length > 0) setSelectedGradeLevel(relevantGradeLevels[0]!);
  }, [relevantGradeLevels, selectedGradeLevel]);
  useEffect(() => {
    if (!selectedClassId && relevantClasses.length > 0) setSelectedClassId(relevantClasses[0]!.id);
  }, [relevantClasses, selectedClassId]);

  const termReady = term.status === 'success' || term.status === 'refreshing';
  const canSubmit = termReady && (mode === 'gradeLevel' ? Boolean(selectedGradeLevel) : Boolean(selectedClassId));

  const handleSubmit = async () => {
    if (!feeRule || !termReady || !canSubmit) return;
    setSubmitting(true);
    try {
      const students = mode === 'gradeLevel' && selectedGradeLevel
        ? await nemisBridge.listStudents({ gradeLevel: selectedGradeLevel, isActive: true, limit: 2000 })
        : await nemisBridge.listStudents({ classId: selectedClassId, isActive: true, limit: 2000 });
      const outcome = await bulkAssignObligations({
        feeRuleId: String(feeRule.id),
        academicYearId: term.data.academicYearId,
        termId: term.data.id,
        requiredAmount: Number(feeRule.amount),
        studentIds: students.items.map((s) => s.id),
      });
      setResult(outcome);
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={feeRule !== null} onClose={onClose} title={feeRule ? String(feeRule.name) : 'Assign Obligations'} size="sm">
      {feeRule && (
        result ? (
          <div className="space-y-4 py-2">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">✅</span>
                <div><span className="text-2xl font-bold text-slate-900">{result.created}</span><span className="ml-2 text-sm text-slate-500">obligations created</span></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">⏭</span>
                <div><span className="text-2xl font-bold text-slate-900">{result.skipped}</span><span className="ml-2 text-sm text-slate-500">skipped (already assigned)</span></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl">❌</span>
                <div><span className="text-2xl font-bold text-slate-900">{result.errors.length}</span><span className="ml-2 text-sm text-slate-500">errors</span></div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1 pt-1">
                {result.errors.slice(0, 5).map((e) => <p key={e.studentId} className="text-xs text-red-500">Student {e.studentId}: {e.reason}</p>)}
                {result.errors.length > 5 && <p className="text-xs text-slate-400">+ {result.errors.length - 5} more errors</p>}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {!termReady && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-600">Loading the current term — try again in a moment.</div>}
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">Target</p>
              <div className="flex gap-2">
                {(['gradeLevel', 'class'] as TargetMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${mode === m ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                    {m === 'gradeLevel' ? 'Grade Level' : 'Class'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'gradeLevel' ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Grade Level</label>
                {relevantGradeLevels.length === 0 ? (
                  <p className="text-xs text-slate-400">No grade levels match this fee rule.</p>
                ) : (
                  <select value={selectedGradeLevel} onChange={(e) => setSelectedGradeLevel(e.target.value as GradeLevelValue)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
                    {relevantGradeLevels.map((gl) => <option key={gl} value={gl}>{human(gl)}</option>)}
                  </select>
                )}
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Class</label>
                {relevantClasses.length === 0 ? (
                  <p className="text-xs text-slate-400">No classes match this fee rule.</p>
                ) : (
                  <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900">
                    {relevantClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` — ${c.section}` : ''} ({human(c.gradeLevel)})</option>)}
                  </select>
                )}
              </div>
            )}

            {termReady && <p className="text-xs text-slate-400">Current term: <span className="font-medium">{term.data.name}</span></p>}

            <div className="flex gap-3 pt-1">
              <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
              <Button fullWidth disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
                {submitting ? 'Assigning…' : 'Assign →'}
              </Button>
            </div>
          </div>
        )
      )}
    </Drawer>
  );
}
