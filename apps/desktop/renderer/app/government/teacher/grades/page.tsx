'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Award, CheckCircle, Info, Lock, Save, Send,
} from 'lucide-react';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { Alert, Button, ErrorState, Spinner } from '@nemis-desktop/ui';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import {
  useAcademicFoundationViewModel,
  useAcademicYearViewModel,
  useStudentsViewModel,
  useTeachingAssignmentViewModel,
} from '@/lib/presentation/hooks/school-admin';
import { useViewModel } from '@/hooks/use-view-model';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { DatabaseUnavailablePanel } from '@/components/dashboard/DatabaseUnavailablePanel';
import {
  GRADE_STATUS_STYLE,
  getGradingConfig,
  listAllWindows,
  listGradesForPeriod,
  listPeriodsForTerm,
  parseGradeScale,
  type GradeScaleItem,
} from '@/components/academic-grading/shared';

interface ClassOption {
  classId: string;
  label: string;
  subjects: { id: string; name: string }[];
}

interface Scores {
  ca: number | null;
  test: number | null;
  exam: number | null;
}

function letterFor(scale: GradeScaleItem[], pct: number): string | undefined {
  return scale.find((band) => pct >= band.min && pct <= band.max)?.letter;
}

/** Teacher Gradebook — mirrors portal-web's grades page (term/class/subject/
 * period selectors, a window-status banner, a per-student score table, Save
 * + Submit actions) but built on the real desktop `grades` table via the
 * generic offline collection API instead of a weighted assessment-template
 * system, which the desktop backend doesn't have (no assessment_templates
 * table exists — see components/academic-grading/WindowGradesPage.tsx for
 * the school-admin side of the same constraint).
 *
 * The `grades` table has three fixed score components — assessmentScore
 * (CA), testScore, examScore — instead of arbitrary weighted templates. A
 * REGULAR_PERIOD uses CA + Test; a MIDTERM_EXAM/FINAL_EXAM period uses a
 * single Exam score, the same regular-vs-exam split the web page makes, just
 * against the fields that actually exist. Submitting is gated on the grading
 * period's grade_entry_window being OPEN, matching the schema's real
 * DRAFT → OPEN → CLOSED → PUBLISHED lifecycle that the school-admin Windows
 * page already manages. */
export default function TeacherGradesPage() {
  const currentUser = useCurrentUserViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();
  const academicYear = useAcademicYearViewModel();
  const foundation = useAcademicFoundationViewModel();
  const students = useStudentsViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const assignments = useViewModel(teachingAssignments.store, (s) => s.assignments);
  const year = useViewModel(academicYear.store, (s) => s.current);
  const terms = useViewModel(foundation.store, (s) => s.terms);
  const studentList = useViewModel(students.store, (s) => s.list);

  const userId = user.status === 'success' ? user.data.id : undefined;

  // The signed-in identity (`userId`, the `users` table) and the id every
  // teaching-assignment record is keyed by (`staff.id`) are different id
  // spaces — `staff.userId` is the (unique) bridge between them. Mirrors
  // government/teacher/page.tsx.
  const [staffId, setStaffId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void sharedBridge.listSchoolAdminRecords({ collection: 'staff', limit: 250 }).then((result) => {
      if (cancelled) return;
      const mine = result.items.find((r) => r.userId === userId);
      setStaffId(mine ? String(mine.id) : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (staffId && assignments.status === 'idle') void teachingAssignments.load(staffId);
    if (year.status === 'idle') void academicYear.loadCurrent();
  }, [staffId, assignments.status, teachingAssignments, year.status, academicYear]);

  useEffect(() => {
    if (year.status === 'success' || year.status === 'refreshing') void foundation.loadTerms(year.data.id);
  }, [year, foundation]);

  const hasAssignmentData = assignments.status === 'success' || assignments.status === 'refreshing';

  const myClasses = useMemo<ClassOption[]>(() => {
    if (!hasAssignmentData) return [];
    const byClass = new Map<string, ClassOption>();
    for (const a of assignments.data) {
      const existing = byClass.get(a.classId);
      const label = `${a.className}${a.section ? ` — ${a.section}` : ''}`;
      if (existing) {
        if (a.subjectId && a.subjectName && !existing.subjects.some((s) => s.id === a.subjectId)) {
          existing.subjects.push({ id: a.subjectId, name: a.subjectName });
        }
      } else {
        byClass.set(a.classId, {
          classId: a.classId,
          label,
          subjects: a.subjectId && a.subjectName ? [{ id: a.subjectId, name: a.subjectName }] : [],
        });
      }
    }
    return Array.from(byClass.values());
  }, [hasAssignmentData, assignments]);

  const termOptions = terms.status === 'success' || terms.status === 'refreshing' ? terms.data : [];

  const [selectedTermId, setSelectedTermId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');

  useEffect(() => {
    if (!selectedTermId && termOptions.length > 0) setSelectedTermId(termOptions[0]!.id);
  }, [termOptions, selectedTermId]);

  useEffect(() => {
    if (!selectedClassId && myClasses.length > 0) setSelectedClassId(myClasses[0]!.classId);
  }, [myClasses, selectedClassId]);

  const selectedClass = myClasses.find((c) => c.classId === selectedClassId);

  useEffect(() => {
    setSelectedSubjectId('');
  }, [selectedClassId]);

  useEffect(() => {
    setSelectedPeriodId('');
  }, [selectedTermId]);

  const [periods, setPeriods] = useState<SchoolAdminRecord[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  useEffect(() => {
    if (!selectedTermId) {
      setPeriods([]);
      return;
    }
    let cancelled = false;
    setLoadingPeriods(true);
    void listPeriodsForTerm(selectedTermId).then((rows) => {
      if (!cancelled) {
        setPeriods(rows);
        setLoadingPeriods(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTermId]);

  const selectedPeriod = periods.find((p) => String(p.id) === selectedPeriodId);
  const isExamPeriod = selectedPeriod?.periodType === 'MIDTERM_EXAM' || selectedPeriod?.periodType === 'FINAL_EXAM';
  const maxMarks = Number(selectedPeriod?.maxMarks ?? 100);

  const [windows, setWindows] = useState<SchoolAdminRecord[] | null>(null);
  useEffect(() => {
    void listAllWindows().then(setWindows);
  }, []);

  const selectedWindow = (windows ?? []).find((w) => w.gradingPeriodId === selectedPeriodId);
  const isWindowOpen = selectedWindow?.status === 'OPEN';

  const [config, setConfig] = useState<SchoolAdminRecord | null>(null);
  useEffect(() => {
    void getGradingConfig().then(setConfig);
  }, []);
  const gradeScale = useMemo(() => parseGradeScale(config?.gradeScale), [config]);

  useEffect(() => {
    if (selectedClassId) {
      students.setFilters({ classId: selectedClassId, isActive: true, sort: 'name' });
      void students.loadStudents();
    }
  }, [selectedClassId, students]);

  const roster = studentList.status === 'success' || studentList.status === 'refreshing' ? studentList.data : [];

  const [grades, setGrades] = useState<SchoolAdminRecord[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(false);

  const reloadGrades = async (periodId: string) => {
    setLoadingGrades(true);
    setGrades(await listGradesForPeriod(periodId));
    setLoadingGrades(false);
  };

  useEffect(() => {
    if (selectedPeriodId) void reloadGrades(selectedPeriodId);
    else setGrades([]);
  }, [selectedPeriodId]);

  const gradeFor = (studentId: string): SchoolAdminRecord | undefined =>
    grades.find(
      (g) =>
        String(g.studentId) === studentId
        && String(g.subjectId) === selectedSubjectId
        && String(g.classId) === selectedClassId,
    );

  const [editedScores, setEditedScores] = useState<Record<string, Scores>>({});
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  // Clear local edits immediately when the grading context changes so stale
  // scores from a previous period/subject/class never bleed into the new
  // form (same guard the web page uses).
  useEffect(() => {
    setEditedScores({});
    setHasUnsaved(false);
    setFeedback(null);
  }, [selectedClassId, selectedSubjectId, selectedPeriodId]);

  // Populate from the server only when local edits are empty.
  useEffect(() => {
    if (roster.length === 0 || grades.length === 0) return;
    setEditedScores((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const initial: Record<string, Scores> = {};
      for (const student of roster) {
        const g = gradeFor(student.id);
        initial[student.id] = {
          ca: g?.assessmentScore != null ? Number(g.assessmentScore) : null,
          test: g?.testScore != null ? Number(g.testScore) : null,
          exam: g?.examScore != null ? Number(g.examScore) : null,
        };
      }
      return initial;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, grades]);

  const setScore = (studentId: string, field: keyof Scores, value: string) => {
    const numValue = value === '' ? null : Number(value);
    if (numValue !== null && (Number.isNaN(numValue) || numValue < 0 || numValue > maxMarks)) return;
    setEditedScores((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? { ca: null, test: null, exam: null }), [field]: numValue },
    }));
    setHasUnsaved(true);
  };

  const computeTotals = (
    scores: Scores,
  ): { marksObtained: number | null; percentage: number | null; letterGrade: string | undefined } => {
    const relevant = isExamPeriod ? [scores.exam] : [scores.ca, scores.test];
    const provided = relevant.filter((v): v is number => v !== null && v !== undefined);
    if (provided.length === 0) return { marksObtained: null, percentage: null, letterGrade: undefined };
    const marksObtained = provided.reduce((sum, v) => sum + v, 0);
    const percentage = maxMarks > 0 ? Math.min(100, Math.max(0, Math.round((marksObtained / maxMarks) * 1000) / 10)) : null;
    const letterGrade = percentage !== null ? letterFor(gradeScale, percentage) : undefined;
    return { marksObtained, percentage, letterGrade };
  };

  const isLocked = (studentId: string): boolean => {
    const g = gradeFor(studentId);
    return g ? g.status !== 'DRAFT' : false;
  };

  const persist = async (nextStatus: 'DRAFT' | 'SUBMITTED') => {
    if (!selectedClassId || !selectedSubjectId || !selectedPeriodId) return;
    for (const student of roster) {
      if (isLocked(student.id)) continue;
      const scores = editedScores[student.id] ?? { ca: null, test: null, exam: null };
      const { marksObtained, percentage, letterGrade } = computeTotals(scores);
      if (marksObtained === null) continue; // nothing entered for this student — skip
      const existing = gradeFor(student.id);
      await sharedBridge.saveSchoolAdminRecord({
        collection: 'grades',
        record: {
          ...(existing ? { id: existing.id } : {}),
          studentId: student.id,
          subjectId: selectedSubjectId,
          classId: selectedClassId,
          gradingPeriodId: selectedPeriodId,
          assessmentScore: isExamPeriod ? null : scores.ca,
          testScore: isExamPeriod ? null : scores.test,
          examScore: isExamPeriod ? scores.exam : null,
          marksObtained,
          maxMarks,
          percentage,
          letterGrade: letterGrade ?? null,
          isPublished: existing?.isPublished ?? false,
          status: nextStatus,
        },
      });
    }
    await reloadGrades(selectedPeriodId);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await persist('DRAFT');
      setHasUnsaved(false);
      setFeedback({ kind: 'success', message: 'Scores saved.' });
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to save scores.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!isWindowOpen) {
      setFeedback({ kind: 'error', message: 'The grade entry window is not open.' });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await persist('SUBMITTED');
      setHasUnsaved(false);
      setFeedback({ kind: 'success', message: 'Grades submitted.' });
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to submit grades.' });
    } finally {
      setSubmitting(false);
    }
  };

  const filtersComplete = Boolean(selectedTermId && selectedClassId && selectedSubjectId && selectedPeriodId);

  if (assignments.status === 'error' && assignments.error.kind === 'database-unavailable') {
    return (
      <div className="min-h-full bg-slate-100 px-6 py-6">
        <DatabaseUnavailablePanel onRetry={() => staffId && void teachingAssignments.load(staffId)} />
      </div>
    );
  }
  if (assignments.status === 'error') {
    return (
      <div className="min-h-full bg-slate-100 px-6 py-6">
        <ErrorState
          message={assignments.error.userMessage}
          onRetry={() => staffId && void teachingAssignments.load(staffId)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <div className="bg-white border border-slate-300 rounded-card p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Term</label>
              <select
                value={selectedTermId}
                onChange={(e) => setSelectedTermId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              >
                <option value="">Select Term</option>
                {termOptions.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              >
                <option value="">Select Class</option>
                {myClasses.map((cls) => (
                  <option key={cls.classId} value={cls.classId}>
                    {cls.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                disabled={!selectedClassId}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              >
                <option value="">Select Subject</option>
                {(selectedClass?.subjects ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Grading Period</label>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                disabled={!selectedTermId}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              >
                {loadingPeriods ? (
                  <option>Loading...</option>
                ) : (
                  <>
                    <option value="">Select Period</option>
                    {periods.map((period) => (
                      <option key={String(period.id)} value={String(period.id)}>
                        {String(period.name)}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>

          {selectedPeriodId && (
            <div
              className={`mt-3 p-2.5 flex items-center gap-2 text-sm rounded-lg ${
                isWindowOpen ? 'bg-active/10 border border-active/20 text-active' : 'bg-pending/10 text-pending'
              }`}
            >
              {isWindowOpen ? <CheckCircle className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span className="font-bold">
                Grade entry window is {selectedWindow ? String(selectedWindow.status) : 'not set up'}.
              </span>
            </div>
          )}
        </div>

        {feedback && <Alert variant={feedback.kind === 'success' ? 'success' : 'error'}>{feedback.message}</Alert>}

        {!filtersComplete ? (
          <div className="bg-white border border-slate-300 rounded-card text-center py-12">
            <Award className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500">Select a term, class, subject, and grading period to begin.</p>
          </div>
        ) : loadingGrades || studentList.status === 'loading' ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : roster.length === 0 ? (
          <div className="bg-white border border-slate-300 rounded-card text-center py-16">
            <Info className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-500">No students enrolled in this class.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-300 rounded-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-secondary/20">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase border-r w-10">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase border-r min-w-[200px]">
                      Student
                    </th>
                    {isExamPeriod ? (
                      <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase border-r min-w-[160px]">
                        Exam Score
                        <span className="block text-[10px] font-normal text-slate-400">(max {maxMarks})</span>
                      </th>
                    ) : (
                      <>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase border-r min-w-[120px]">
                          CA
                          <span className="block text-[10px] font-normal text-slate-400">(max {maxMarks})</span>
                        </th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase border-r min-w-[120px]">
                          Test
                          <span className="block text-[10px] font-normal text-slate-400">(max {maxMarks})</span>
                        </th>
                      </>
                    )}
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase border-r min-w-[100px]">
                      Final
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase min-w-[100px]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((student, index) => {
                    const scores = editedScores[student.id] ?? { ca: null, test: null, exam: null };
                    const { percentage, letterGrade } = computeTotals(scores);
                    const locked = isLocked(student.id);
                    const grade = gradeFor(student.id);
                    const inputClass = `w-24 text-center p-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-primary ${
                      locked ? 'bg-slate-100 cursor-not-allowed text-slate-500' : ''
                    }`;
                    return (
                      <tr key={student.id} className="border-b hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-sm text-slate-500 border-r text-center">{index + 1}</td>
                        <td className="px-4 py-2 text-sm font-medium text-slate-900 border-r">{student.fullName}</td>
                        {isExamPeriod ? (
                          <td className="px-2 py-1 border-r">
                            <input
                              type="number"
                              value={scores.exam ?? ''}
                              onChange={(e) => setScore(student.id, 'exam', e.target.value)}
                              disabled={locked}
                              min="0"
                              max={maxMarks}
                              className={inputClass}
                            />
                          </td>
                        ) : (
                          <>
                            <td className="px-2 py-1 border-r">
                              <input
                                type="number"
                                value={scores.ca ?? ''}
                                onChange={(e) => setScore(student.id, 'ca', e.target.value)}
                                disabled={locked}
                                min="0"
                                max={maxMarks}
                                className={inputClass}
                              />
                            </td>
                            <td className="px-2 py-1 border-r">
                              <input
                                type="number"
                                value={scores.test ?? ''}
                                onChange={(e) => setScore(student.id, 'test', e.target.value)}
                                disabled={locked}
                                min="0"
                                max={maxMarks}
                                className={inputClass}
                              />
                            </td>
                          </>
                        )}
                        <td className="px-4 py-2 text-center text-sm font-bold text-slate-800 border-r">
                          {percentage !== null ? `${percentage}%` : '—'}
                          {letterGrade ? <span className="ml-1 text-xs font-normal text-slate-400">({letterGrade})</span> : null}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              GRADE_STATUS_STYLE[String(grade?.status ?? 'DRAFT')] ?? 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {grade ? String(grade.status) : 'Not saved'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50/50 border-t">
              {!isWindowOpen && (
                <span className="flex items-center gap-1.5 text-sm text-pending">
                  <Lock className="w-4 h-4" />
                  Window closed — entries can be saved as drafts but not submitted.
                </span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="secondary" onClick={() => void handleSave()} disabled={saving || !hasUnsaved}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button onClick={() => void handleSubmit()} disabled={submitting || !isWindowOpen}>
                  <Send className="w-4 h-4 mr-2" />
                  {submitting ? 'Submitting...' : 'Submit Grades'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
