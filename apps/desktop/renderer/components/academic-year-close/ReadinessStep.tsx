'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CloseMissingCell, CloseReadiness, FillCellEntry } from '@nemis-desktop/types';
import { Button } from '@nemis-desktop/ui';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { academicYearCloseBridge } from '@/services/nemis-bridge/school-admin/academic-year-close-bridge';
import { FILL_REASON_LABEL, READINESS_HEADING } from './close-copy';

const cellKey = (c: CloseMissingCell) => `${c.studentId}|${c.subjectId}|${c.gradingPeriodId}`;

interface Draft {
  score: string;
  reason: string;
}

/** Step 1: what still blocks the close. Always read from the server. */
export function ReadinessStep({
  yearId,
  notice,
  onContinue,
}: {
  yearId: string;
  /** Why the server refused the previous close attempt, if it did. */
  notice: string | null;
  onContinue: () => void;
}) {
  const [readiness, setReadiness] = useState<CloseReadiness | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setReadiness(await academicYearCloseBridge.getCloseReadiness(yearId));
      setError(null);
    } catch (cause) {
      setError(parseIpcError(cause)?.message || 'Readiness could not be loaded. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [yearId]);

  useEffect(() => { void load(); }, [load]);

  const setDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [key]: { score: '', reason: '', ...d[key], ...patch } }));

  const save = async () => {
    if (!readiness) return;
    const entries: FillCellEntry[] = [];
    for (const c of readiness.missingCells) {
      const d = drafts[cellKey(c)];
      if (!d || (d.score.trim() === '' && d.reason.trim() === '')) continue;
      const where = `${c.studentName}, ${c.subjectName}, ${c.gradingPeriodName}`;
      const score = Number(d.score);
      if (d.score.trim() === '' || !Number.isFinite(score) || score < 0 || score > 100) {
        setError(`Enter a score from 0 to 100 for ${where}.`);
        return;
      }
      if (d.reason.trim() === '') {
        setError(`${FILL_REASON_LABEL} is required (${where}).`);
        return;
      }
      entries.push({
        studentId: c.studentId, subjectId: c.subjectId, gradingPeriodId: c.gradingPeriodId,
        score, reason: d.reason.trim(),
      });
    }
    if (entries.length === 0) {
      setError('Enter at least one mark to save.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await academicYearCloseBridge.fillCloseCells({ yearId, entries });
      setDrafts({});
      await load();
    } catch (cause) {
      setError(parseIpcError(cause)?.message || 'The marks could not be saved. Please try again.');
      setBusy(false);
    }
  };

  const blocked = !readiness || readiness.unpublishedPeriods.length > 0 || readiness.missingCells.length > 0;

  return (
    <section className="space-y-4" aria-label="Readiness">
      {notice && <p role="alert" className="rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-800">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {readiness && blocked && (
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">{READINESS_HEADING}</h3>
          {readiness.unpublishedPeriods.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-800">Grading periods not yet published</p>
              <ul className="list-disc pl-5 text-sm text-slate-700">
                {readiness.unpublishedPeriods.map((p) => <li key={p.id}>{p.name}</li>)}
              </ul>
            </div>
          )}
          {readiness.missingCells.length > 0 && (
            <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3">Subject</th>
                    <th className="p-3">Period</th><th className="p-3">Score</th><th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {readiness.missingCells.map((c) => {
                    const key = cellKey(c);
                    return (
                      <tr key={key} className="border-b align-top last:border-0">
                        <td className="p-3">{c.studentName}</td>
                        <td className="p-3">{c.className}</td>
                        <td className="p-3">{c.subjectName}</td>
                        <td className="p-3">{c.gradingPeriodName}</td>
                        <td className="p-3">
                          <input
                            type="number" min={0} max={100}
                            aria-label={`Score for ${c.studentName}, ${c.subjectName}, ${c.gradingPeriodName}`}
                            className="w-20 rounded border border-slate-300 px-2 py-1"
                            value={drafts[key]?.score ?? ''}
                            onChange={(e) => setDraft(key, { score: e.target.value })}
                          />
                        </td>
                        <td className="p-3">
                          <label className="block text-xs text-slate-500">
                            {FILL_REASON_LABEL}
                            <input
                              className="mt-1 block w-56 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
                              value={drafts[key]?.reason ?? ''}
                              onChange={(e) => setDraft(key, { reason: e.target.value })}
                            />
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {readiness && !blocked && (
        <p className="text-sm text-slate-700">
          Every grade is in. {readiness.cohort.present} present
          {readiness.cohort.withdrawn > 0 ? ` and ${readiness.cohort.withdrawn} withdrawn` : ''} students are in this close.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void load()}>Re-check</Button>
        {readiness && readiness.missingCells.length > 0 && (
          <Button variant="secondary" disabled={busy} onClick={() => void save()}>Save marks</Button>
        )}
        <Button disabled={busy || blocked} onClick={onContinue}>Continue</Button>
      </div>
    </section>
  );
}
