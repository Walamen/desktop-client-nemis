'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Download, Search, Users } from 'lucide-react';
import { Input } from '@nemis-desktop/ui';
import { formatNemisId, normalizeNemisId } from '@nemis-desktop/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel, useStudentsViewModel } from '@/lib/presentation/hooks/school-admin';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { GradeLevel, type SchoolAdminRecord } from '@nemis-desktop/types';
import { useQueryParam } from '@/hooks/use-query-param';
import { GRADE_STATUS_STYLE, listGradesForPeriod, pctTone } from './shared';
import { listAssessmentsForGradingPeriod } from './assessments';
import { buildWindowGrades } from './window-grades';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { academicSetupHref } from '@/lib/academic-setup';

const GRADE_LEVEL_ORDER: readonly string[] = Object.values(GradeLevel);

/** Read-only grade review for a single window — mirrors portal-web's
 * windows/[id]/grades page. The `grades` collection holds one row per
 * student x assessment (`assessmentId` set) plus a final row per student x
 * subject (`assessmentId` null); `buildWindowGrades` reproduces the server's
 * `getWindowGrades` from those rows and the period's assessments. */
export function WindowGradesPage() {
  const windowId = useQueryParam('id');
  const foundation = useAcademicFoundationViewModel();
  const students = useStudentsViewModel();
  const classesState = useViewModel(foundation.store, (s) => s.classes);
  const subjectsState = useViewModel(foundation.store, (s) => s.subjects);
  const studentList = useViewModel(students.store, (s) => s.list);

  const [win, setWin] = useState<SchoolAdminRecord | null>(null);
  const [grades, setGrades] = useState<SchoolAdminRecord[]>([]);
  const [assessments, setAssessments] = useState<SchoolAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [search, setSearch] = useState('');

  // A different window while mounted: drop everything derived from the old
  // one. Declared before the load below so the reset lands first.
  useEffect(() => {
    setWin(null);
    setGrades([]);
    setAssessments([]);
    setSelectedClassId('');
    setSelectedSubjectId('');
    setSearch('');
    setLoadError(false);
  }, [windowId]);

  useRevalidateOnSync(() => {
    void foundation.loadClasses();
    void foundation.loadSubjects();
  }, [foundation]);

  useRevalidateOnSync(() => {
    if (!windowId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    let cancelled = false;
    void (async () => {
      try {
        const result = await sharedBridge.listSchoolAdminRecords({ collection: 'grade_entry_windows', limit: 250 });
        if (cancelled) return;
        const found = result.items.find((item) => item.id === windowId) ?? null;
        const periodId = found?.gradingPeriodId ? String(found.gradingPeriodId) : '';
        const [gradeRows, assessmentRows] = periodId
          ? await Promise.all([listGradesForPeriod(periodId), listAssessmentsForGradingPeriod(periodId)])
          : [[], []];
        if (cancelled) return;
        setWin(found);
        setGrades(gradeRows);
        setAssessments(assessmentRows);
        setLoading(false);
      } catch (cause) {
        if (cancelled) return;
        console.error('[WindowGradesPage] load failed', cause);
        setLoadError(true);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [windowId]);

  const view = useMemo(() => buildWindowGrades(grades, assessments), [grades, assessments]);
  const classNames = useMemo(
    () => (classesState.status === 'success' || classesState.status === 'refreshing' ? classesState.data : []),
    [classesState],
  );
  // The server orders a window's classes by gradeLevel then name; gradeLevel
  // is a Postgres enum, so "asc" is the enum's declared order (KG … GRADE_12),
  // not string order. view.classIds is first-appearance order instead.
  const classIds = useMemo(() => {
    const rowById = new Map(classNames.map((c) => [c.id, c]));
    const levelRank = (level: string) => {
      const index = GRADE_LEVEL_ORDER.indexOf(level);
      return index === -1 ? GRADE_LEVEL_ORDER.length : index;
    };
    const byClassOrder = (a: string, b: string): number => {
      const x = rowById.get(a);
      const y = rowById.get(b);
      if (!x || !y) return x ? -1 : y ? 1 : a.localeCompare(b);
      return (
        levelRank(x.gradeLevel) - levelRank(y.gradeLevel) ||
        x.gradeLevel.localeCompare(y.gradeLevel) ||
        x.name.localeCompare(y.name)
      );
    };
    return [...view.classIds].sort(byClassOrder);
  }, [view, classNames]);
  const subjectNames = useMemo(
    () => (subjectsState.status === 'success' || subjectsState.status === 'refreshing' ? subjectsState.data : []),
    [subjectsState],
  );

  useEffect(() => {
    if (!selectedClassId && classIds.length > 0) setSelectedClassId(classIds[0]!);
  }, [classIds, selectedClassId]);

  useEffect(() => {
    if (selectedClassId) {
      students.setFilters({ classId: selectedClassId, isActive: true, sort: 'name' });
      // setPageSize resets to page 1 and reloads, so no separate loadStudents().
      void students.setPageSize(100);
    }
  }, [selectedClassId, students]);

  const classLabel = (id: string) => classNames.find((c) => c.id === id)?.name ?? id;
  const subjectLabel = (id: string) => subjectNames.find((s) => s.id === id)?.name ?? id;

  const subjectIdsForClass = useMemo(() => {
    const label = (id: string) => subjectNames.find((s) => s.id === id)?.name ?? id;
    return view.subjectIdsFor(selectedClassId).sort((a, b) => label(a).localeCompare(label(b)));
  }, [view, selectedClassId, subjectNames]);

  useEffect(() => {
    if (subjectIdsForClass.length > 0 && !subjectIdsForClass.includes(selectedSubjectId)) {
      setSelectedSubjectId(subjectIdsForClass[0]!);
    } else if (subjectIdsForClass.length === 0) {
      setSelectedSubjectId('');
    }
  }, [subjectIdsForClass, selectedSubjectId]);

  const columns = useMemo(
    () => (selectedClassId && selectedSubjectId ? view.assessmentsFor(selectedClassId, selectedSubjectId) : []),
    [view, selectedClassId, selectedSubjectId],
  );

  const rosterStudents = useMemo(
    () => (studentList.status === 'success' || studentList.status === 'refreshing' ? studentList.data : []),
    [studentList],
  );

  const filteredStudents = useMemo(() => {
    const rawQuery = search.trim();
    if (!rawQuery) return rosterStudents;
    const q = (normalizeNemisId(rawQuery) ?? rawQuery).toLowerCase();
    return rosterStudents.filter((s) => s.fullName.toLowerCase().includes(q) || (s.nemisId?.toLowerCase().includes(q) ?? false));
  }, [rosterStudents, search]);

  const summary = view.summary;

  const handleExport = () => {
    if (!selectedClassId || !selectedSubjectId) return;
    const header = [
      'Student',
      'NEMIS ID',
      ...columns.map((a) => `${a.name} (/${a.totalMarks})`),
      'Final %',
      'Grade',
      'Status',
    ];
    // The web exports every student of the class, not just the search matches.
    const csvRows = rosterStudents.map((student) => {
      const final = view.finalFor(student.id, selectedClassId, selectedSubjectId);
      return [
        student.fullName,
        // Exported DASHED for readability — there is no desktop grade import
        // today so this never round-trips back in. If one is ever built, it
        // MUST strip separators (normalizeNemisId) before matching, since the
        // stored/compared form is always the 12 bare digits.
        student.nemisId ? formatNemisId(student.nemisId) : '',
        ...columns.map((a) => view.marksFor(student.id, a.id) ?? ''),
        final?.percentage != null ? final.percentage.toFixed(1) : '',
        final?.letterGrade ?? '',
        final?.status ?? 'Not submitted',
      ];
    });
    const csv = [header, ...csvRows].map((r) => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `grades-${classLabel(selectedClassId)}-${subjectLabel(selectedSubjectId)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-primary px-6 py-5 text-white">
        <div>
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">
            School Admin · Academic Grading
          </p>
          <h1 className="text-xl font-bold">{win ? String(win.name) : 'Grade Entry Results'}</h1>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href={academicSetupHref('windows')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-secondary hover:text-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Windows
          </Link>
          {selectedClassId && selectedSubjectId && (
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-400"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center border border-slate-300 bg-white p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
          </div>
        ) : loadError ? (
          <div className="border border-slate-300 bg-white p-12 text-center text-slate-500">{"Couldn't load grades. It will retry after the next sync."}</div>
        ) : !win ? (
          <div className="border border-slate-300 bg-white p-12 text-center text-slate-500">Window not found.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: 'Classes', value: summary.classes },
                { label: 'Students Graded', value: summary.studentsGraded },
                { label: 'Finals Submitted', value: summary.finalsSubmitted },
                { label: 'Finals Published', value: summary.finalsPublished },
              ].map((item) => (
                <div key={item.label} className="rounded-card border border-slate-300 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{item.label}</p>
                  <p className="mt-2 text-4xl font-bold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>

            {classIds.length === 0 ? (
              <div className="border border-slate-300 bg-white py-16 text-center">
                <p className="font-medium text-slate-500">No classes in this window</p>
                <p className="mt-1 text-sm text-slate-400">No grades have been recorded for this grading period yet.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {classIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setSelectedClassId(id);
                        setSelectedSubjectId('');
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-button border px-3.5 py-2 text-sm font-semibold transition-colors ${
                        selectedClassId === id
                          ? 'border-primary bg-primary text-white'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-secondary hover:text-secondary'
                      }`}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {classLabel(id)}
                    </button>
                  ))}
                </div>

                {selectedClassId && (
                  <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
                    {subjectIdsForClass.length === 0 ? (
                      <div className="py-16 text-center">
                        <p className="font-medium text-slate-500">No grades for {classLabel(selectedClassId)} yet</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-secondary/20 px-4 pt-3">
                          {subjectIdsForClass.map((id) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setSelectedSubjectId(id)}
                              className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                                selectedSubjectId === id
                                  ? 'border-secondary text-secondary'
                                  : 'border-transparent text-slate-500 hover:text-slate-700'
                              }`}
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              {subjectLabel(id)}
                            </button>
                          ))}
                        </div>
                        <div className="border-b border-slate-100 px-4 py-3">
                          <div className="max-w-sm">
                            <Input
                              type="text"
                              icon={<Search className="h-4 w-4 text-slate-400" />}
                              placeholder="Search student name or NEMIS ID…"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </div>
                        </div>
                        {studentList.status === 'loading' && <div className="p-6 text-sm text-slate-500">Loading students…</div>}
                        {(studentList.status === 'success' || studentList.status === 'refreshing') && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50">
                                  <th className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                                    Student
                                  </th>
                                  <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                                    NEMIS ID
                                  </th>
                                  {columns.map((a) => (
                                    <th
                                      key={a.id}
                                      className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-slate-400"
                                    >
                                      <div>{a.name}</div>
                                      <div className="normal-case font-normal text-slate-300">
                                        /{a.totalMarks}
                                        {a.weight != null ? ` · ${a.weight}%` : ''}
                                      </div>
                                    </th>
                                  ))}
                                  <th className="whitespace-nowrap px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
                                    Final Grade
                                  </th>
                                  <th className="whitespace-nowrap px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {filteredStudents.map((student) => {
                                  const final = view.finalFor(student.id, selectedClassId, selectedSubjectId);
                                  return (
                                    <tr key={student.id} className="transition-colors hover:bg-slate-50">
                                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                                        {student.fullName}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-400">
                                        {student.nemisId ? formatNemisId(student.nemisId) : '—'}
                                      </td>
                                      {columns.map((a) => {
                                        const marks = view.marksFor(student.id, a.id);
                                        return (
                                          <td key={a.id} className="px-3 py-3 text-center tabular-nums">
                                            {marks != null ? (
                                              <span className="font-semibold text-slate-700">
                                                {marks}
                                                <span className="mx-0.5 font-normal text-slate-300">/</span>
                                                <span className="font-normal text-slate-500">{a.totalMarks}</span>
                                              </span>
                                            ) : (
                                              <span className="text-slate-300">—</span>
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums">
                                        {final ? (
                                          <span className={pctTone(final.percentage)}>
                                            {final.percentage != null
                                              ? `${final.percentage.toFixed(1)}%`
                                              : `${final.marksObtained}/${final.maxMarks}`}
                                            {final.letterGrade ? (
                                              <span className="font-normal text-slate-400"> ({final.letterGrade})</span>
                                            ) : null}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-slate-400">Not submitted</span>
                                        )}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-3 text-center">
                                        {final ? (
                                          <span
                                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                                              GRADE_STATUS_STYLE[final.status] ?? 'bg-slate-100 text-slate-600'
                                            }`}
                                          >
                                            {final.status}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-slate-300">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {filteredStudents.length === 0 && (
                                  <tr>
                                    <td colSpan={4 + columns.length} className="py-12 text-center text-sm text-slate-400">
                                      No students match your search.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
