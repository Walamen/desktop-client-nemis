'use client';

import type { CarryOverMatching } from '@nemis-desktop/types';

type Option = { id: string; label: string };

function MatchSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-2 items-center gap-3 text-sm">
      <span className="text-slate-700">{label}</span>
      <select
        aria-label={label}
        className="rounded border border-slate-300 px-2 py-1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Not matched</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface MatchingFieldsProps {
  sourcePeriods: { id: string; name: string; termName: string }[];
  sourceSubjects: { id: string; name: string }[];
  targetPeriods: { id: string; name: string; termName: string }[];
  targetSubjects: { id: string; name: string }[];
  matching: CarryOverMatching;
  onChange: (matching: CarryOverMatching) => void;
  disabled?: boolean;
}

/** The two matching sections (grading periods, subjects) shared by the
 * Stage 5 "Match prior record" page and the review page's Match step. */
export function MatchingFields({
  sourcePeriods,
  sourceSubjects,
  targetPeriods,
  targetSubjects,
  matching,
  onChange,
  disabled = false,
}: MatchingFieldsProps) {
  const periodOptions = targetPeriods.map((p) => ({ id: p.id, label: `${p.termName} — ${p.name}` }));
  const subjectOptions = targetSubjects.map((s) => ({ id: s.id, label: s.name }));
  return (
    <>
      <section className="space-y-2 rounded-card border border-slate-300 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Grading periods</h2>
        {sourcePeriods.map((p) => (
          <MatchSelect
            key={p.id}
            label={`${p.termName} — ${p.name}`}
            value={matching.periods[p.id] ?? ''}
            options={periodOptions}
            disabled={disabled}
            onChange={(v) => onChange({ ...matching, periods: { ...matching.periods, [p.id]: v || null } })}
          />
        ))}
      </section>
      <section className="space-y-2 rounded-card border border-slate-300 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Subjects</h2>
        {sourceSubjects.map((s) => (
          <MatchSelect
            key={s.id}
            label={s.name}
            value={matching.subjects[s.id] ?? ''}
            options={subjectOptions}
            disabled={disabled}
            onChange={(v) => onChange({ ...matching, subjects: { ...matching.subjects, [s.id]: v || null } })}
          />
        ))}
      </section>
    </>
  );
}
