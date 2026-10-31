'use client';

import type {
  ReportCardOutcome,
  ReportCardColumn,
  ReportCardIssueStatus,
  ReportCardPayloadV1,
} from '@nemis-desktop/types';
import { formatNemisId } from '@nemis-desktop/shared';
import { Badge } from '@nemis-desktop/ui';

export interface ReportCardViewProps {
  payload: ReportCardPayloadV1;
  /** Issue status; staff see withdrawn and replaced cards flagged. */
  status?: ReportCardIssueStatus;
  version?: number;
}

const DASH = '—';

function gradeLabel(level: string): string {
  return level
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : String(value);
}

/** Term-average and yearly columns are visually distinct from period columns. */
function columnClass(kind: ReportCardColumn['kind']): string {
  if (kind === 'TERM_AVERAGE') return 'bg-sky-50 font-semibold';
  if (kind === 'YEARLY_AVERAGE') return 'bg-slate-200 font-bold';
  return '';
}

function outcomeLine(outcome: ReportCardOutcome, currentGrade: string): string {
  switch (outcome.status) {
    case 'PROMOTED':
      return outcome.nextGradeLevel ? `Promoted to ${gradeLabel(outcome.nextGradeLevel)}` : 'Promoted';
    case 'RETAINED':
      return `Retained in ${gradeLabel(currentGrade)}`;
    case 'GRADUATED':
      return 'Graduated';
    case 'WITHDRAWN':
      return 'Withdrawn';
  }
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-slate-900 mt-0.5">{children}</dd>
    </div>
  );
}

/** Renders a report card payload on screen. Pure display: readers never
 * recompute a card, and there are deliberately no print or PDF controls. */
type PriorRow = NonNullable<ReportCardPayloadV1['priorSchoolRecord']>[number];

/** Unmatched carried marks grouped by the school that earned them, in order. */
function priorBySchool(rows: ReportCardPayloadV1['priorSchoolRecord']): [string, PriorRow[]][] {
  const groups = new Map<string, PriorRow[]>();
  for (const row of rows ?? []) {
    const list = groups.get(row.schoolName) ?? [];
    list.push(row);
    groups.set(row.schoolName, list);
  }
  return [...groups.entries()];
}

export function ReportCardView({ payload, status, version }: ReportCardViewProps) {
  if (payload.schemaVersion !== 1) {
    return (
      <article className="bg-white border border-slate-300 rounded-card p-6">
        <p className="text-sm text-slate-700">This report card uses a newer format. Update the app to view it.</p>
      </article>
    );
  }
  const { student, school, columns, subjects, overall, attendance } = payload;
  const fullName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ');
  const kindLabel = payload.kind === 'FINAL' ? 'Final report' : 'Period report';

  return (
    <article className="bg-white border border-slate-300 rounded-card p-6 space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{school.name}</h3>
            {school.principalName && (
              <p className="text-sm text-slate-500">Principal: {school.principalName}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {status === 'WITHDRAWN' && <Badge variant="error" size="sm">Withdrawn</Badge>}
            {status === 'SUPERSEDED' && <Badge variant="warning" size="sm">Replaced by a newer version</Badge>}
            {version !== undefined && <Badge variant="neutral" size="sm">{`Version ${version}`}</Badge>}
          </div>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Fact label="Student">
            <span className="font-semibold">{fullName}</span>
            <br />
            <span className="text-xs text-slate-500">
              NEMIS ID: <span className="font-mono">{formatNemisId(student.nemisId)}</span>
            </span>
          </Fact>
          <Fact label="Class">{payload.class.name}</Fact>
          <Fact label="Grade">{gradeLabel(payload.class.gradeLevel)}</Fact>
          <Fact label="Academic year">{payload.academicYear.name}</Fact>
          <Fact label="Report">
            {kindLabel}
            {payload.issuedForPeriod ? ` — ${payload.issuedForPeriod.name}` : ''}
          </Fact>
        </dl>
      </header>

      <div className="overflow-x-auto border border-slate-200 rounded">
        <table className="w-full text-sm">
          <thead className="bg-secondary/20 text-slate-700">
            <tr>
              <th scope="col" className="text-left py-2 px-3 text-xs font-bold uppercase">Subject</th>
              {columns.map((c) => (
                <th
                  scope="col"
                  key={c.key}
                  data-column-kind={c.kind}
                  className={`text-center py-2 px-3 text-xs font-bold uppercase ${columnClass(c.kind)}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {subjects.map((s) => (
              <tr key={s.subjectId}>
                <td className="py-2 px-3 font-medium text-slate-900">{s.name}</td>
                {columns.map((c) => {
                  const cell = s.cells[c.key];
                  return (
                    <td key={c.key} className={`py-2 px-3 text-center ${columnClass(c.kind)}`}>
                      {fmt(cell?.value)}
                      {cell?.source === 'CARRIED' && cell.sourceSchoolName && (
                        <span className="block text-[11px] font-normal text-slate-500">
                          {cell.sourceSchoolName}
                        </span>
                      )}
                      {cell?.source === 'ADMIN_AT_CLOSE' && (
                        <span className="block text-[11px] font-normal text-slate-500">Entered at close</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className="py-2 px-3">Overall</td>
              {columns.map((c) => (
                <td key={c.key} className={`py-2 px-3 text-center ${columnClass(c.kind)}`}>
                  {fmt(overall[c.key])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <section aria-label="Attendance" className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-900">Attendance (days)</h4>
        <dl className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
          {(
            [
              ['Present', attendance.present],
              ['Absent', attendance.absent],
              ['Late', attendance.late],
              ['Excused', attendance.excused],
              ['Sick', attendance.sick],
              ['Carried', attendance.carriedDays],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="bg-slate-50 rounded p-2">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-base font-semibold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        {attendance.carriedDays > 0 && (
          <p className="text-xs text-slate-500">
            Includes {attendance.carriedDays} days carried from a previous school.
          </p>
        )}
      </section>

      {priorBySchool(payload.priorSchoolRecord).map(([schoolName, rows]) => (
        <section key={schoolName} aria-label={`Earned at ${schoolName}`} className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-900">Earned at {schoolName}</h4>
          <table className="min-w-full text-sm">
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="py-1 pr-3 text-slate-800">{row.subjectName}</td>
                  <td className="py-1 pr-3 text-slate-500">{row.periodLabel}</td>
                  <td className="py-1 text-right font-semibold text-slate-900">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {payload.kind === 'FINAL' && (payload.outcome || payload.principalRemark) && (
        <section aria-label="Year outcome" className="space-y-2">
          {payload.outcome && (
            <p data-testid="report-card-outcome" className="text-base font-bold text-slate-900">
              {outcomeLine(payload.outcome, payload.class.gradeLevel)}
            </p>
          )}
          {payload.principalRemark && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Principal&apos;s remark</h4>
              <p className="text-sm text-slate-700">{payload.principalRemark}</p>
            </div>
          )}
        </section>
      )}

      <p className="text-sm text-slate-600">Pass mark: {payload.passMark}</p>
    </article>
  );
}
