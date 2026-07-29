'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Download, Search, Users } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel, useStudentsViewModel } from '@/lib/presentation/hooks';
import { nemisBridge } from '@/services/nemis-bridge';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { queryId } from '@/components/classes/shared';
import { GRADE_STATUS_STYLE, listGradesForPeriod, pctTone } from './shared';

/** Read-only grade review for a single window — mirrors portal-web's
 * windows/[id]/grades page. Desktop's `grades` table already stores one row
 * per student x subject x grading period with the final component scores
 * (CA/Test/Exam) and computed percentage/letter/status baked in, so this
 * reads that real data directly instead of re-deriving a per-assessment
 * matrix the desktop backend doesn't have (assessments repo is unbuilt). */
export function WindowGradesPage() {
  const windowId = queryId();
  const foundation = useAcademicFoundationViewModel();
  const students = useStudentsViewModel();
  const classesState = useViewModel(foundation.store, (s) => s.classes);
  const subjectsState = useViewModel(foundation.store, (s) => s.subjects);
  const studentList = useViewModel(students.store, (s) => s.list);

  const [win, setWin] = useState<SchoolAdminRecord | null>(null);
  const [grades, setGrades] = useState<SchoolAdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void foundation.loadClasses();
    void foundation.loadSubjects();
  }, [foundation]);

  useEffect(() => {
    if (!windowId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const result = await nemisBridge.listSchoolAdminRecords({ collection: 'grade_entry_windows', limit: 250 });
      const found = result.items.find((item) => item.id === windowId) ?? null;
      setWin(found);
      const rows = found?.gradingPeriodId ? await listGradesForPeriod(String(found.gradingPeriodId)) : [];
      setGrades(rows);
      setLoading(false);
    })();
  }, [windowId]);

  const classIds = useMemo(
    () => Array.from(new Set(grades.map((g) => String(g.classId ?? '')).filter(Boolean))),
    [grades],
  );
  const classNames = classesState.status === 'success' || classesState.status === 'refreshing' ? classesState.data : [];
  const subjectNames =
    subjectsState.status === 'success' || subjectsState.status === 'refreshing' ? subjectsState.data : [];

  useEffect(() => {
    if (!selectedClassId && classIds.length > 0) setSelectedClassId(classIds[0]!);
  }, [classIds, selectedClassId]);

  useEffect(() => {
    if (selectedClassId) {
      students.setFilters({ classId: selectedClassId, isActive: true, sort: 'name' });
      void students.loadStudents();
    }
  }, [selectedClassId, students]);

  const subjectIdsForClass = useMemo(
    () =>
      Array.from(
        new Set(grades.filter((g) => String(g.classId) === selectedClassId).map((g) => String(g.subjectId ?? ''))),
      ).filter(Boolean),
    [grades, selectedClassId],
  );

  useEffect(() => {
    if (subjectIdsForClass.length > 0 && !subjectIdsForClass.includes(selectedSubjectId)) {
      setSelectedSubjectId(subjectIdsForClass[0]!);
    } else if (subjectIdsForClass.length === 0) {
      setSelectedSubjectId('');
    }
  }, [subjectIdsForClass, selectedSubjectId]);

  const classLabel = (id: string) => classNames.find((c) => c.id === id)?.name ?? id;
  const subjectLabel = (id: string) => {
    const subject = subjectNames.find((s) => s.id === id);
    return subject ? `${subject.code} — ${subject.name}` : id;
  };

  const filteredStudents = useMemo(() => {
    const rows = studentList.status === 'success' || studentList.status === 'refreshing' ? studentList.data : [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) => s.fullName.toLowerCase().includes(q) || s.admissionNumber.toLowerCase().includes(q));
  }, [studentList, search]);

  const gradeFor = (studentId: string) =>
    grades.find(
      (g) => String(g.studentId) === studentId && String(g.subjectId) === selectedSubjectId && String(g.classId) === selectedClassId,
    );

  const summary = useMemo(() => {
    const scoped = grades.filter((g) => g.classId && g.subjectId);
    const studentsGraded = new Set(scoped.map((g) => String(g.studentId))).size;
    const finalsSubmitted = scoped.filter((g) => g.status && g.status !== 'DRAFT').length;
    const finalsPublished = scoped.filter((g) => Boolean(g.isPublished)).length;
    return { classes: classIds.length, studentsGraded, finalsSubmitted, finalsPublished };
  }, [grades, classIds]);

  const handleExport = () => {
    if (!selectedClassId || !selectedSubjectId) return;
    const header = ['Student', 'Adm #', 'CA', 'Test', 'Exam', 'Marks', 'Percentage', 'Grade', 'Status'];
    const csvRows = filteredStudents.map((student) => {
      const grade = gradeFor(student.id);
      return [
        student.fullName,
        student.admissionNumber,
        grade?.assessmentScore ?? '',
        grade?.testScore ?? '',
        grade?.examScore ?? '',
        grade ? `${grade.marksObtained}/${grade.maxMarks}` : '',
        grade?.percentage != null ? `${grade.percentage}%` : '',
        grade?.letterGrade ?? '',
        grade?.status ?? 'Not submitted',
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
            href="/government/school-admin/academic-grading/windows"
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
                          <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search student name or admission #…"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                              className="w-full rounded-button border border-slate-300 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
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
                                    Adm #
                                  </th>
                                  <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
                                    CA
                                  </th>
                                  <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
                                    Test
                                  </th>
                                  <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
                                    Exam
                                  </th>
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
                                  const grade = gradeFor(student.id);
                                  return (
                                    <tr key={student.id} className="transition-colors hover:bg-slate-50">
                                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                                        {student.fullName}
                                      </td>
                                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-400">
                                        {student.admissionNumber}
                                      </td>
                                      <td className="px-3 py-3 text-center tabular-nums text-slate-600">
                                        {grade?.assessmentScore ?? '—'}
                                      </td>
                                      <td className="px-3 py-3 text-center tabular-nums text-slate-600">
                                        {grade?.testScore ?? '—'}
                                      </td>
                                      <td className="px-3 py-3 text-center tabular-nums text-slate-600">
                                        {grade?.examScore ?? '—'}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums">
                                        {grade ? (
                                          <span className={pctTone(grade.percentage)}>
                                            {grade.percentage != null
                                              ? `${Number(grade.percentage).toFixed(1)}%`
                                              : `${grade.marksObtained}/${grade.maxMarks}`}
                                            {grade.letterGrade ? (
                                              <span className="font-normal text-slate-400"> ({String(grade.letterGrade)})</span>
                                            ) : null}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-slate-400">Not submitted</span>
                                        )}
                                      </td>
                                      <td className="whitespace-nowrap px-4 py-3 text-center">
                                        {grade ? (
                                          <span
                                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                                              GRADE_STATUS_STYLE[String(grade.status)] ?? 'bg-slate-100 text-slate-600'
                                            }`}
                                          >
                                            {String(grade.status)}
                                            {grade.isPublished ? ' · Published' : ''}
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
                                    <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
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
