'use client';

import { useEffect, useState } from 'react';
import type {
  CompletionOutcome,
  PromotionDecisionInput,
  PromotionOverview,
  PromotionStudent,
} from '@nemis-desktop/types';
import { Button } from '@nemis-desktop/ui';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { academicYearCloseBridge } from '@/services/nemis-bridge/school-admin/academic-year-close-bridge';
import { OUTCOME_LABEL, gradeLabel, nextGradeFor, outcomesFor } from './close-copy';

interface Row {
  /** Null until the admin chooses (no server suggestion). */
  outcome: CompletionOutcome | null;
  overrideReason: string;
  remark: string;
}

/** The outcome a student starts with: a saved decision, else the suggestion. */
function initialRow(s: PromotionStudent): Row | null {
  if (s.kind === 'WITHDRAWN') return s.principalRemark ? { outcome: null, overrideReason: '', remark: s.principalRemark } : null;
  const outcome = s.decision?.outcome ?? s.suggestion ?? null;
  return { outcome, overrideReason: s.decision?.overrideReason ?? '', remark: s.principalRemark ?? '' };
}

/** Step 2: the promotion table. Always read from the server. */
export function PromotionStep({ yearId, onSaved }: { yearId: string; onSaved: () => void }) {
  const [overview, setOverview] = useState<PromotionOverview | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [allRemark, setAllRemark] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await academicYearCloseBridge.getClosePromotion(yearId);
        if (cancelled) return;
        const next: Record<string, Row> = {};
        for (const s of data.students) {
          const row = initialRow(s);
          if (row) next[s.studentId] = row;
        }
        setRows(next);
        setOverview(data);
      } catch (cause) {
        if (!cancelled) setError(parseIpcError(cause)?.message || 'Promotion could not be loaded. Please try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [yearId]);

  const patch = (id: string, change: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { outcome: null, overrideReason: '', remark: '', ...r[id], ...change } }));

  const applyToAll = () => {
    if (!overview) return;
    setRows((r) => {
      const next = { ...r };
      for (const s of overview.students) {
        next[s.studentId] = { outcome: null, overrideReason: '', ...next[s.studentId], remark: allRemark.trim() };
      }
      return next;
    });
  };

  const save = async () => {
    if (!overview) return;
    const decisions: PromotionDecisionInput[] = [];
    for (const s of overview.students) {
      if (s.kind !== 'PRESENT') continue;
      const row = rows[s.studentId];
      if (!row) continue;
      if (row.outcome === null) {
        setError(`Choose an outcome for ${s.name}.`);
        return;
      }
      const overriding = s.suggestion !== null && row.outcome !== s.suggestion;
      if (overriding && row.overrideReason.trim() === '') {
        setError(`Give a reason for overriding the suggestion for ${s.name}.`);
        return;
      }
      decisions.push({
        studentId: s.studentId,
        outcome: row.outcome,
        nextGradeLevel: nextGradeFor(s.gradeLevel, row.outcome),
        ...(overriding ? { overrideReason: row.overrideReason.trim() } : {}),
      });
    }
    const principalRemarks = overview.students
      .map((s) => ({ studentId: s.studentId, remark: rows[s.studentId]?.remark.trim() ?? '' }))
      .filter((r) => r.remark !== '');
    setBusy(true);
    setError(null);
    try {
      await academicYearCloseBridge.saveClosePromotion({ yearId, decisions, principalRemarks });
      onSaved();
    } catch (cause) {
      setError(parseIpcError(cause)?.message || 'The decisions could not be saved. Please try again.');
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" aria-label="Promotion">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {overview && (
        <>
          <p className="text-sm text-slate-600">
            Pass mark {overview.passMark}%. A student at or above it is suggested for promotion; going against the
            suggestion needs a reason.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm text-slate-700">
              Principal remark for all students
              <input
                className="mt-1 block w-72 rounded border border-slate-300 px-2 py-1"
                value={allRemark} onChange={(e) => setAllRemark(e.target.value)}
              />
            </label>
            <Button variant="secondary" onClick={applyToAll}>Apply to all</Button>
          </div>
          <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3">Yearly average</th>
                  <th className="p-3">Suggestion</th><th className="p-3">Outcome</th><th className="p-3">Next grade</th>
                  <th className="p-3">Principal remark</th>
                </tr>
              </thead>
              <tbody>
                {overview.students.map((s) => {
                  const row = rows[s.studentId];
                  const present = s.kind === 'PRESENT';
                  const overriding = present && row?.outcome != null && s.suggestion !== null && row.outcome !== s.suggestion;
                  const next = row?.outcome && present ? nextGradeFor(s.gradeLevel, row.outcome) : null;
                  return (
                    <tr key={s.studentId} className="border-b align-top last:border-0">
                      <td className="p-3">{s.name}</td>
                      <td className="p-3">{gradeLabel(s.gradeLevel)}</td>
                      <td className="p-3">{s.yearlyAverage === null ? '—' : `${s.yearlyAverage}%`}</td>
                      <td className="p-3">{s.suggestion ? OUTCOME_LABEL[s.suggestion] : '—'}</td>
                      <td className="p-3">
                        {present && row ? (
                          <>
                            <select
                              aria-label={`Outcome for ${s.name}`}
                              className="rounded border border-slate-300 px-2 py-1"
                              value={row.outcome ?? ''}
                              onChange={(e) => patch(s.studentId, { outcome: e.target.value as CompletionOutcome })}
                            >
                              {row.outcome === null && <option value="" disabled>Choose…</option>}
                              {outcomesFor(s.gradeLevel).map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
                            </select>
                            {overriding && (
                              <input
                                aria-label={`Reason for overriding ${s.name}`}
                                placeholder="Reason for overriding"
                                className="mt-2 block w-56 rounded border border-slate-300 px-2 py-1"
                                value={row.overrideReason}
                                onChange={(e) => patch(s.studentId, { overrideReason: e.target.value })}
                              />
                            )}
                          </>
                        ) : 'Withdrawn'}
                      </td>
                      <td className="p-3">{present && row ? (next ? gradeLabel(next) : '—') : '—'}</td>
                      <td className="p-3">
                        <input
                          aria-label={`Principal remark for ${s.name}`}
                          className="w-56 rounded border border-slate-300 px-2 py-1"
                          value={row?.remark ?? ''}
                          onChange={(e) => patch(s.studentId, { remark: e.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="flex justify-end">
        <Button disabled={busy || !overview} onClick={() => void save()}>Save and continue</Button>
      </div>
    </section>
  );
}
