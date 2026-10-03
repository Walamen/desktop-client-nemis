'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CohortResult, GradeLevel } from '@nemis-desktop/types';
import { Button, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { gradeCompletionBridge } from '@/services/nemis-bridge/school-admin/grade-completion-bridge';
import { human } from '../students/shared';
import { buildDecisions, draftFromRow, nameStudentIds, offeredGrades, type OutcomeDraft } from './outcomes-logic';
import { OutcomeRow } from './OutcomeRow';

const SAVED_NOTE = 'Grade changes apply after sync.';
const OFFLINE_AVERAGES = 'Averages are shown when online.';
const DASH = '—';

type Averages =
  | { status: 'idle' | 'offline' | 'error' }
  | { status: 'ok'; byId: ReadonlyMap<string, number | null> };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const unenrolledNote = (n: number) =>
  n === 1
    ? '1 student in this grade has no enrolment for this year and is not listed.'
    : `${n} students in this grade have no enrolment for this year and are not listed.`;

/** End-of-year outcomes for one (academic year, grade) cohort. The cohort and
 * decisions are local; saving queues the decisions, and the server changes the
 * students' grades only once it accepts them (D7) — this screen never does. */
export function EndOfYearOutcomesPage() {
  const foundation = useAcademicFoundationViewModel();
  const years = useViewModel(foundation.store, (s) => s.academicYears);
  const gradeLevels = useViewModel(foundation.store, (s) => s.gradeLevels);
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);

  const [yearId, setYearId] = useState('');
  const [grade, setGrade] = useState<GradeLevel | ''>('');
  const [cohort, setCohort] = useState<CohortResult | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, OutcomeDraft>>({});
  // Rows the admin has edited since the last save: a sync-triggered reload
  // must not wipe their unsaved choices.
  const edited = useRef(new Set<string>());
  const [averages, setAverages] = useState<Averages>({ status: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState<string | null>(null);

  useEffect(() => {
    void foundation.loadAcademicYears();
    void foundation.loadGradeLevels();
  }, [foundation]);

  const yearRows = years.status === 'success' || years.status === 'refreshing' ? years.data : [];
  const defaultYearId = (yearRows.find((y) => y.isCurrent) ?? yearRows[0])?.id ?? '';

  // Default to the current academic year once the list arrives.
  useEffect(() => {
    if (!yearId && defaultYearId) setYearId(defaultYearId);
  }, [yearId, defaultYearId]);

  const offered = offeredGrades(
    gradeLevels.status === 'success' || gradeLevels.status === 'refreshing' ? gradeLevels.data : null,
  );

  useRevalidateOnSync(() => {
    if (!yearId || !grade) return;
    let cancelled = false;
    gradeCompletionBridge
      .getCohort(yearId, grade)
      .then((result) => {
        if (cancelled) return;
        setCohort(result);
        setLoadError(false);
        setDrafts((prev) =>
          Object.fromEntries(
            result.rows.map((row) => {
              const kept = edited.current.has(row.studentId) ? prev[row.studentId] : undefined;
              return [row.studentId, kept ?? draftFromRow(row)];
            }),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [yearId, grade, reloadKey]);

  // Averages come from the server only; offline the column shows a dash.
  useEffect(() => {
    if (!yearId || !grade) return;
    if (!online) {
      setAverages({ status: 'offline' });
      return;
    }
    let cancelled = false;
    setAverages({ status: 'idle' });
    gradeCompletionBridge
      .getGuidance(yearId, grade)
      .then((rows) => {
        if (!cancelled) setAverages({ status: 'ok', byId: new Map(rows.map((r) => [r.studentId, r.average])) });
      })
      .catch((e: unknown) => {
        if (!cancelled) setAverages({ status: messageOf(e).includes('[OFFLINE]') ? 'offline' : 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [yearId, grade, online]);

  const resetCohort = () => {
    setCohort(null);
    setDrafts({});
    edited.current.clear();
    setNotice(null);
    setError(null);
    setLoadError(false);
  };

  const averageOf = (studentId: string) => {
    if (averages.status !== 'ok') return DASH;
    const value = averages.byId.get(studentId);
    return value == null ? DASH : String(Math.round(value * 10) / 10);
  };

  const onSave = async () => {
    if (!cohort || !yearId || !grade) return;
    setNotice(null);
    const built = buildDecisions(cohort.rows, drafts);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    if (built.decisions.length === 0) {
      setError('Choose an outcome for at least one student.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await gradeCompletionBridge.save({ academicYearId: yearId, gradeLevel: grade, decisions: built.decisions });
      edited.current.clear();
      setNotice(SAVED_NOTE);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(`Couldn't save the outcomes: ${messageOf(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const onDiscard = async (studentId: string) => {
    if (!yearId) return;
    setDiscarding(studentId);
    setError(null);
    try {
      await gradeCompletionBridge.discard(yearId, studentId);
      edited.current.delete(studentId);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(`Couldn't discard the change: ${messageOf(e)}`);
    } finally {
      setDiscarding(null);
    }
  };

  const rows = cohort?.rows ?? [];
  const hasLocalChanges = rows.some((r) => r.syncState === 'pending' || r.syncState === 'rejected');

  let body: ReactNode;
  if (years.status === 'empty') {
    body = (
      <p className="text-sm text-amber-700">
        There are no academic years on this device. Add one under Academic Years, or sync this device, to record
        outcomes.
      </p>
    );
  } else if (years.status === 'error') {
    body = (
      <div className="text-sm text-red-700">
        Couldn&apos;t load the academic years.{' '}
        <Button type="button" variant="secondary" onClick={() => void foundation.loadAcademicYears()}>
          Try again
        </Button>
      </div>
    );
  } else if (!yearId) {
    body = <p className="text-sm text-slate-500">Loading…</p>;
  } else if (!grade) {
    body = <p className="text-sm text-slate-500">Choose a grade to see its students.</p>;
  } else if (loadError) {
    body = (
      <div className="text-sm text-red-700">
        Couldn&apos;t load the students.{' '}
        <Button type="button" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </div>
    );
  } else if (!cohort) {
    body = <p className="text-sm text-slate-500">Loading…</p>;
  } else {
    body = (
      <div className="space-y-3">
        {cohort.unenrolledCount > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {unenrolledNote(cohort.unenrolledCount)}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No students were enrolled in this grade that year.</p>
        ) : (
          <>
            {averages.status === 'offline' && <p className="text-sm text-slate-500">{OFFLINE_AVERAGES}</p>}
            {averages.status === 'error' && <p className="text-sm text-slate-500">Couldn&apos;t load averages.</p>}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Outcome</th>
                    <th className="px-3 py-2">Next grade</th>
                    <th className="px-3 py-2">Notes</th>
                    <th className="px-3 py-2">Average</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <OutcomeRow
                      key={row.studentId}
                      row={row}
                      draft={drafts[row.studentId] ?? draftFromRow(row)}
                      grade={grade}
                      offered={offered}
                      average={averageOf(row.studentId)}
                      syncError={row.syncError ? nameStudentIds(row.syncError, rows) : null}
                      discarding={discarding === row.studentId}
                      onChange={(draft) => {
                        edited.current.add(row.studentId);
                        setDrafts((prev) => ({ ...prev, [row.studentId]: draft }));
                      }}
                      onDiscard={() => void onDiscard(row.studentId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {hasLocalChanges && (
              <p className="text-xs text-slate-500">
                &ldquo;Discard my change&rdquo; drops this device&apos;s unsynced decision. The school&apos;s
                recorded outcome for that student, if any, reappears after the next full sync.
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button type="button" disabled={saving} onClick={() => void onSave()}>
                Save outcomes
              </Button>
              <span className="text-xs text-slate-500">
                Saves every decision in this table ({rows.filter((r) => drafts[r.studentId]?.outcome).length} of{' '}
                {rows.length} students).
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold">End-of-Year Outcomes</h1>
        <p className="text-sm text-slate-500">
          Record whether each student was promoted, retained or graduated. Decisions are kept on this device and
          sent when it syncs; students&apos; grades change only after that.
        </p>
      </div>
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {yearRows.length > 0 && (
        <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Academic year"
            aria-label="Academic year"
            options={yearRows.map((y) => ({ value: y.id, label: y.isCurrent ? `${y.code} (current)` : y.code }))}
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value);
              resetCohort();
            }}
          />
          <Select
            label="Grade"
            aria-label="Grade"
            placeholder="Select grade"
            options={offered.map((g) => ({ value: g, label: human(g) }))}
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value as GradeLevel);
              resetCohort();
            }}
          />
        </div>
      )}
      {body}
    </div>
  );
}
