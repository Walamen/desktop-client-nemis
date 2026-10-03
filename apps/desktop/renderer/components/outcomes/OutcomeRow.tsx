'use client';
import type { CohortRow, CompletionOutcome, GradeLevel, GradeCompletionSyncState } from '@nemis-desktop/types';
import { COMPLETION_OUTCOMES } from '@nemis-desktop/types';
import { formatNemisId } from '@nemis-desktop/shared';
import { Badge, Button } from '@nemis-desktop/ui';
import { human } from '../students/shared';
import { defaultNextGrade, nextGradeOptions, studentName, type OutcomeDraft } from './outcomes-logic';

export const OUTCOME_LABELS: Record<CompletionOutcome, string> = {
  PROMOTED: 'Promoted',
  RETAINED: 'Retained',
  GRADUATED: 'Graduated',
};

const SYNC_BADGE: Record<GradeCompletionSyncState, { label: string; variant: 'success' | 'warning' | 'error' }> = {
  synced: { label: 'Synced', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  rejected: { label: 'Rejected', variant: 'error' },
};

const controlClass = 'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:bg-gray-100';

/** One student of the cohort: their decision controls, average and sync state. */
export function OutcomeRow({
  row,
  draft,
  grade,
  offered,
  average,
  syncError,
  discarding,
  onChange,
  onDiscard,
}: {
  row: CohortRow;
  draft: OutcomeDraft;
  /** The cohort's grade (the year being closed). */
  grade: GradeLevel;
  offered: readonly GradeLevel[];
  /** Display text for the average: a number, or a dash. */
  average: string;
  /** The rejection message with student ids already replaced by names. */
  syncError: string | null;
  discarding: boolean;
  onChange: (draft: OutcomeDraft) => void;
  onDiscard: () => void;
}) {
  const name = studentName(row);
  const graduated = draft.outcome === 'GRADUATED';
  const badge = row.syncState ? SYNC_BADGE[row.syncState] : null;
  const canDiscard = row.syncState === 'pending' || row.syncState === 'rejected';

  return (
    <tr aria-label={`Outcome for ${name}`} className="border-t border-gray-100 align-top">
      <td className="px-3 py-2">
        <div className="font-medium text-slate-900">{name}</div>
        <div className="font-mono text-xs text-slate-500">
          {row.nemisId ? formatNemisId(row.nemisId) : 'No NEMIS ID'}
        </div>
      </td>
      <td className="px-3 py-2">
        <select
          aria-label="Outcome"
          className={controlClass}
          value={draft.outcome}
          onChange={(e) => {
            const outcome = e.target.value as CompletionOutcome | '';
            onChange({ ...draft, outcome, nextGradeLevel: defaultNextGrade(outcome, grade) });
          }}
        >
          <option value="">Choose…</option>
          {COMPLETION_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {OUTCOME_LABELS[o]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          aria-label="Next grade"
          className={controlClass}
          value={graduated ? '' : draft.nextGradeLevel}
          disabled={graduated || !draft.outcome}
          onChange={(e) => onChange({ ...draft, nextGradeLevel: e.target.value as GradeLevel | '' })}
        >
          <option value="">{graduated ? 'None' : 'Choose…'}</option>
          {nextGradeOptions(offered, draft.nextGradeLevel).map((g) => (
            <option key={g} value={g}>
              {human(g)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          aria-label="Notes"
          className={controlClass}
          value={draft.notes}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
        />
      </td>
      <td className="px-3 py-2 text-sm text-slate-700">{average}</td>
      <td className="px-3 py-2 text-sm">
        {badge && (
          <Badge variant={badge.variant} size="sm">
            {badge.label}
          </Badge>
        )}
        {row.syncState === 'rejected' && syncError && <p className="mt-1 text-xs text-red-700">{syncError}</p>}
        {canDiscard && (
          <div className="mt-2">
            <Button type="button" variant="secondary" size="sm" disabled={discarding} onClick={onDiscard}>
              Discard my change
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
