'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, Award, CheckCircle, Info, Lock, Save, Send,
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
import {
  type AssessmentTemplateRow,
  listAssessmentsForPeriod,
  listTemplatesForSubject,
  materializeAssessment,
  totalWeight,
  weightedPercentage,
} from '@/components/academic-grading/assessments';

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

/** `SchoolAdminModuleService.list()` hard-caps every page at 250 rows
 * (`ORDER BY rowid DESC`, i.e. the 250 most-recently-inserted rows of the
 * WHOLE `grades` table, not scoped to a class/subject/period). The Summary &
 * Submit readiness check and submit action both need to see every grade row
 * a teacher has ever written, or scoring one subject's full roster can evict
 * an earlier subject's rows from the window and make that subject's
 * readiness permanently read "0 scored" even though it's genuinely done.
 * Page through the whole collection instead of taking just the first page. */
async function listAllGrades(): Promise<SchoolAdminRecord[]> {
  const all: SchoolAdminRecord[] = [];
  let offset = 0;
  for (;;) {
    const result = await sharedBridge.listSchoolAdminRecords({ collection: 'grades', limit: 250, offset });
    all.push(...result.items);
    offset += result.items.length;
    if (result.items.length === 0 || all.length >= result.total) break;
  }
  return all;
}

/** Teacher Gradebook — mirrors portal-web's grades page (term/class/subject/
 * period selectors, a window-status banner, a per-student score table, Save
 * + Submit actions) built on the real desktop `grades` table via the generic
 * offline collection API.
 *
 * Two independent scoring paths share this page, split on `isExamPeriod`:
 * a MIDTERM_EXAM/FINAL_EXAM period still uses the original fixed single Exam
 * score against `grades.examScore` (this path is unchanged from before
 * assessment templates existed). A REGULAR_PERIOD now scores against the
 * per-subject weighted assessment templates from
 * components/academic-grading/assessments.ts (`assessment_templates` +
 * `assessments` + `grades.assessmentId`), matching web's weighted-template
 * design instead of fixed CA/Test fields. Submitting is gated on the grading
 * period's grade_entry_window being OPEN, matching the schema's real
 * DRAFT → OPEN → CLOSED → PUBLISHED lifecycle that the school-admin Windows
 * page already manages. */
export default function TeacherGradesPage() {
  const router = useRouter();
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
  const [activeTab, setActiveTab] = useState<'scores' | 'submit'>('scores');

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

  // Exam periods never show tabs — force back to the (only rendered)
  // Gradebook grid if the teacher had the Summary & Submit tab open on a
  // regular period and then switches the period selector straight to an
  // exam period. Without this, `activeTab` would stay 'submit' while both
  // the grid (gated on activeTab === 'scores') and the submit panel (gated
  // on !isExamPeriod) go unrendered — a blank page with no way back, since
  // the tab switcher itself is also hidden for exam periods.
  useEffect(() => {
    if (isExamPeriod) setActiveTab('scores');
  }, [isExamPeriod]);

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

  // Memoized (rather than a bare ternary) so the empty-roster branch's `[]`
  // is referentially stable across renders — the readiness-computation
  // effect below now depends on `roster` itself (not just `.length`), and a
  // fresh array literal on every render there would otherwise re-run it
  // every render whenever there's no roster yet.
  const roster = useMemo(
    () => (studentList.status === 'success' || studentList.status === 'refreshing' ? studentList.data : []),
    [studentList],
  );

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

  const [templates, setTemplates] = useState<AssessmentTemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    if (isExamPeriod || !selectedClassId || !selectedSubjectId) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    setLoadingTemplates(true);
    void listTemplatesForSubject(selectedClassId, selectedSubjectId).then((rows_) => {
      if (!cancelled) {
        setTemplates(rows_);
        setLoadingTemplates(false);
      }
    });
    return () => { cancelled = true; };
  }, [isExamPeriod, selectedClassId, selectedSubjectId]);

  // studentId -> templateId -> score. Populated from `grades` rows filtered
  // by assessmentId (via the local `assessments` instances for this period),
  // matching web's getAssessmentScores shape.
  const [templateScores, setTemplateScores] = useState<Record<string, Record<string, number | null>>>({});
  const [scoresPublished, setScoresPublished] = useState(false);

  const reloadTemplateScores = async () => {
    if (isExamPeriod || templates.length === 0 || !selectedPeriodId) {
      setTemplateScores({});
      setScoresPublished(false);
      return;
    }
    const instances = await listAssessmentsForPeriod(selectedClassId, selectedSubjectId, selectedPeriodId);
    const instanceIdByTemplateId = new Map(instances.map((i) => [i.templateId, i.id]));
    const instanceIds = new Set(instances.map((i) => i.id));
    const relevantGrades = grades.filter((g) => g.assessmentId != null && instanceIds.has(String(g.assessmentId)));
    const next: Record<string, Record<string, number | null>> = {};
    for (const grade of relevantGrades) {
      const studentId = String(grade.studentId);
      const templateId = [...instanceIdByTemplateId.entries()].find(([, id]) => id === String(grade.assessmentId))?.[0];
      if (!templateId) continue;
      next[studentId] = { ...(next[studentId] ?? {}), [templateId]: grade.marksObtained != null ? Number(grade.marksObtained) : null };
    }
    setTemplateScores(next);
    setScoresPublished(relevantGrades.some((g) => Boolean(g.isPublished)));
  };

  useEffect(() => {
    void reloadTemplateScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, grades, isExamPeriod, selectedClassId, selectedSubjectId, selectedPeriodId]);

  const setTemplateScore = (studentId: string, templateId: string, value: string, template: AssessmentTemplateRow) => {
    const numValue = value === '' ? null : Number(value);
    if (numValue !== null && (Number.isNaN(numValue) || numValue < 0 || numValue > template.totalMarks)) return;
    setTemplateScores((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? {}), [templateId]: numValue },
    }));
    setHasUnsaved(true);
  };

  const weight = totalWeight(templates);
  const isWeightComplete = Math.abs(weight - 100) < 0.01;

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

  const persistExamScores = async (nextStatus: 'DRAFT' | 'SUBMITTED') => {
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

  const persistTemplateScores = async () => {
    if (!selectedClassId || !selectedSubjectId || !selectedPeriodId) return;
    for (const template of templates) {
      const assessmentId = await materializeAssessment(template, selectedPeriodId);
      for (const student of roster) {
        const score = templateScores[student.id]?.[template.id];
        if (score === undefined) continue;
        const existingGrade = grades.find(
          (g) => String(g.studentId) === student.id && String(g.assessmentId) === assessmentId,
        );
        if (score === null) {
          if (existingGrade) {
            await sharedBridge.deleteSchoolAdminRecord({ collection: 'grades', id: String(existingGrade.id) });
          }
          continue;
        }
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'grades',
          record: {
            ...(existingGrade ? { id: existingGrade.id } : {}),
            studentId: student.id,
            subjectId: selectedSubjectId,
            classId: selectedClassId,
            gradingPeriodId: selectedPeriodId,
            assessmentId,
            marksObtained: score,
            maxMarks: template.totalMarks,
            isPublished: existingGrade?.isPublished ?? false,
            status: existingGrade?.status ?? 'DRAFT',
          },
        });
      }
    }
    await reloadGrades(selectedPeriodId);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      if (isExamPeriod) await persistExamScores('DRAFT');
      else await persistTemplateScores();
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
      await persistExamScores('SUBMITTED');
      setHasUnsaved(false);
      setFeedback({ kind: 'success', message: 'Grades submitted.' });
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to submit grades.' });
    } finally {
      setSubmitting(false);
    }
  };

  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  const handleSendToStudents = async () => {
    setPublishing(true);
    setFeedback(null);
    try {
      if (hasUnsaved) await persistTemplateScores();
      const instances = await listAssessmentsForPeriod(selectedClassId, selectedSubjectId, selectedPeriodId);
      const instanceIds = new Set(instances.map((i) => i.id));
      // Fetch fresh rather than reading the closed-over `grades` state:
      // persistTemplateScores() above may have just created brand-new grade
      // rows (first-time scores for a student/template pair), and its own
      // reloadGrades() call only lands via setGrades — it does not mutate
      // this function's already-captured `grades` closure. Filtering the
      // stale closure would silently skip publishing those new rows.
      const currentGrades = await listGradesForPeriod(selectedPeriodId);
      const toPublish = currentGrades.filter((g) => g.assessmentId != null && instanceIds.has(String(g.assessmentId)));
      for (const grade of toPublish) {
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'grades',
          record: { id: grade.id!, isPublished: true, status: 'PUBLISHED', publishedAt: new Date().toISOString() },
        });
      }
      await reloadGrades(selectedPeriodId);
      setFeedback({ kind: 'success', message: `${toPublish.length} score(s) sent to students.` });
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to send grades to students.' });
    } finally {
      setPublishing(false);
    }
  };

  const handleUpdateGrades = async () => {
    setUnpublishing(true);
    setFeedback(null);
    try {
      const instances = await listAssessmentsForPeriod(selectedClassId, selectedSubjectId, selectedPeriodId);
      const instanceIds = new Set(instances.map((i) => i.id));
      const toUnpublish = grades.filter((g) => g.assessmentId != null && instanceIds.has(String(g.assessmentId)) && Boolean(g.isPublished));
      for (const grade of toUnpublish) {
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'grades',
          record: { id: grade.id!, isPublished: false, status: 'DRAFT', publishedAt: null },
        });
      }
      await reloadGrades(selectedPeriodId);
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to unlock grades.' });
    } finally {
      setUnpublishing(false);
    }
  };

  // Summary & Submit tab — readiness overview across every subject the
  // teacher teaches in the selected class (not just the currently-selected
  // subject), so the teacher can see at a glance which subjects still need
  // work before the final period-level grade can be submitted.
  interface SubjectSubmissionStatus {
    subjectId: string;
    subjectName: string;
    studentsScored: number;
    totalStudents: number;
    weightsTotal: number;
    isReady: boolean;
    notReadyReason: string;
  }

  const [submissionStatuses, setSubmissionStatuses] = useState<SubjectSubmissionStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);

  useEffect(() => {
    if (activeTab !== 'submit' || !selectedClassId || !selectedPeriodId || isExamPeriod) return;
    let cancelled = false;
    setLoadingStatus(true);
    const subjectsInClass = selectedClass?.subjects ?? [];
    void Promise.all(
      subjectsInClass.map(async (subject) => {
        const [subjectTemplates, instances] = await Promise.all([
          listTemplatesForSubject(selectedClassId, subject.id),
          listAssessmentsForPeriod(selectedClassId, subject.id, selectedPeriodId),
        ]);
        // Same reverse-lookup shape as reloadTemplateScores: templateId ->
        // instance id, used here to check that a student has a graded
        // instance for EVERY template, not just any template.
        const instanceIdByTemplateId = new Map(instances.map((i) => [i.templateId, i.id]));
        const instanceIds = new Set(instances.map((i) => i.id));
        const allGrades = await listAllGrades();
        const subjectGrades = allGrades.filter((g) => g.assessmentId != null && instanceIds.has(String(g.assessmentId)));
        const gradedPairs = new Set(subjectGrades.map((g) => `${g.studentId}::${g.assessmentId}`));

        const hasTemplates = subjectTemplates.length > 0;
        const hasRoster = roster.length > 0;
        // "Fully scored" = every roster student has a grade row for every
        // template in this subject (not just "any" template, any student).
        const studentsScored = hasTemplates
          ? roster.filter((student) => subjectTemplates.every((template) => {
              const instanceId = instanceIdByTemplateId.get(template.id);
              return instanceId != null && gradedPairs.has(`${student.id}::${instanceId}`);
            })).length
          : 0;
        const weightsTotal = totalWeight(subjectTemplates);
        const isWeightsComplete = Math.abs(weightsTotal - 100) < 0.01;
        const isReady = hasTemplates && hasRoster && isWeightsComplete && studentsScored === roster.length;

        let notReadyReason: string;
        if (!hasTemplates) notReadyReason = 'No assessment templates set up';
        else if (!hasRoster) notReadyReason = 'No students enrolled';
        else if (!isWeightsComplete) notReadyReason = `Weights total ${weightsTotal}%`;
        else if (studentsScored === 0) notReadyReason = 'No scores entered';
        else notReadyReason = `${studentsScored}/${roster.length} students fully scored`;

        return {
          subjectId: subject.id,
          subjectName: subject.name,
          studentsScored,
          totalStudents: roster.length,
          weightsTotal,
          isReady,
          notReadyReason,
        };
      }),
    ).then((statuses) => {
      if (!cancelled) {
        setSubmissionStatuses(statuses);
        setLoadingStatus(false);
      }
    });
    return () => { cancelled = true; };
  }, [activeTab, selectedClassId, selectedPeriodId, isExamPeriod, selectedClass, roster]);

  const readyCount = submissionStatuses.filter((s) => s.isReady).length;
  const [submittingAll, setSubmittingAll] = useState(false);

  const handleSubmitAllReady = async () => {
    if (!isWindowOpen) {
      setFeedback({ kind: 'error', message: 'The grade entry window is not open.' });
      return;
    }
    setSubmittingAll(true);
    setFeedback(null);
    try {
      for (const status of submissionStatuses.filter((s) => s.isReady)) {
        const subjectTemplates = await listTemplatesForSubject(selectedClassId, status.subjectId);
        const instances = await listAssessmentsForPeriod(selectedClassId, status.subjectId, selectedPeriodId);
        const instanceIdByTemplateId = new Map(instances.map((i) => [i.id, i.templateId]));
        const allGrades = await listAllGrades();
        for (const student of roster) {
          const studentScores = new Map<string, number | null>();
          for (const grade of allGrades) {
            if (String(grade.studentId) !== student.id || grade.assessmentId == null) continue;
            const templateId = instanceIdByTemplateId.get(String(grade.assessmentId));
            if (templateId) studentScores.set(templateId, grade.marksObtained != null ? Number(grade.marksObtained) : null);
          }
          const percentage = weightedPercentage(studentScores, subjectTemplates);
          if (percentage === null) continue;
          const existingPeriodGrade = allGrades.find(
            (g) => String(g.studentId) === student.id && g.assessmentId == null && String(g.gradingPeriodId) === selectedPeriodId && String(g.subjectId) === status.subjectId,
          );
          await sharedBridge.saveSchoolAdminRecord({
            collection: 'grades',
            record: {
              ...(existingPeriodGrade ? { id: existingPeriodGrade.id } : {}),
              studentId: student.id,
              subjectId: status.subjectId,
              classId: selectedClassId,
              gradingPeriodId: selectedPeriodId,
              assessmentId: null,
              marksObtained: percentage,
              maxMarks: 100,
              percentage,
              letterGrade: letterFor(gradeScale, percentage) ?? null,
              isPublished: existingPeriodGrade?.isPublished ?? false,
              status: 'SUBMITTED',
            },
          });
        }
      }
      setFeedback({ kind: 'success', message: `Submitted final grades for ${readyCount} subject(s).` });
      setActiveTab('scores');
    } catch (cause) {
      setFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'Failed to submit grades.' });
    } finally {
      setSubmittingAll(false);
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

        {selectedTermId && selectedClassId && selectedPeriodId && !isExamPeriod && (
          <div className="border-b border-slate-200">
            <nav className="flex gap-1">
              <button onClick={() => setActiveTab('scores')} className={`py-2.5 px-4 rounded-t-lg font-bold text-sm ${activeTab === 'scores' ? 'bg-secondary/10 border-x border-t text-slate-700' : 'text-slate-600'}`}>
                Gradebook
              </button>
              <button onClick={() => setActiveTab('submit')} className={`py-2.5 px-4 rounded-t-lg font-bold text-sm ${activeTab === 'submit' ? 'bg-secondary/10 border-x border-t text-slate-700' : 'text-slate-500'}`}>
                Summary & Submit
              </button>
            </nav>
          </div>
        )}

        {feedback && <Alert variant={feedback.kind === 'success' ? 'success' : 'error'}>{feedback.message}</Alert>}

        {filtersComplete && !isExamPeriod && !loadingTemplates && templates.length === 0 && (
          <div className="bg-white border border-slate-300 rounded-card text-center py-12">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-900">No Assessments Found</h3>
            <p className="text-slate-600 mt-1 mb-4">
              You need to create assessments before you can enter grades.
            </p>
            <Button onClick={() => router.push('/government/teacher/grades/templates')}>
              Go to Assessment Setup
            </Button>
          </div>
        )}

        {filtersComplete && !isExamPeriod && templates.length > 0 && !isWeightComplete && (
          <Alert variant="warning">
            Assessment weights incomplete. Current total: {weight.toFixed(1)}%. You can enter grades now, but you&apos;ll need to complete the weighting (100%) before submitting final grades.
          </Alert>
        )}

        {activeTab === 'scores' && (!filtersComplete ? (
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
                    ) : templates.length === 0 ? null : (
                      templates.map((template) => (
                        <th key={template.id} className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase border-r min-w-[120px]">
                          {template.name}
                          <span className="block text-[10px] font-normal text-slate-400">({template.totalMarks} marks)</span>
                        </th>
                      ))
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
                          templates.map((template) => (
                            <td key={template.id} className="px-2 py-1 border-r">
                              <input
                                type="number"
                                value={templateScores[student.id]?.[template.id] ?? ''}
                                onChange={(e) => setTemplateScore(student.id, template.id, e.target.value, template)}
                                disabled={scoresPublished}
                                min="0"
                                max={template.totalMarks}
                                className={`w-24 text-center p-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-primary ${scoresPublished ? 'bg-slate-100 cursor-not-allowed text-slate-500' : ''}`}
                              />
                            </td>
                          ))
                        )}
                        <td className="px-4 py-2 text-center text-sm font-bold text-slate-800 border-r">
                          {isExamPeriod ? (
                            <>
                              {percentage !== null ? `${percentage}%` : '—'}
                              {letterGrade ? <span className="ml-1 text-xs font-normal text-slate-400">({letterGrade})</span> : null}
                            </>
                          ) : (() => {
                              const pct = weightedPercentage(new Map(Object.entries(templateScores[student.id] ?? {})), templates);
                              return pct !== null ? `${pct}%` : '—';
                            })()}
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
                {isExamPeriod ? (
                  <>
                    <Button variant="secondary" onClick={() => void handleSave()} disabled={saving || !hasUnsaved}>
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button onClick={() => void handleSubmit()} disabled={submitting || !isWindowOpen}>
                      <Send className="w-4 h-4 mr-2" />
                      {submitting ? 'Submitting...' : 'Submit Grades'}
                    </Button>
                  </>
                ) : scoresPublished ? (
                  <Button variant="secondary" onClick={() => void handleUpdateGrades()} disabled={unpublishing}>
                    {unpublishing ? 'Unlocking...' : 'Update Grades'}
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => void handleSave()} disabled={saving || !hasUnsaved}>
                      <Save className="w-4 h-4 mr-2" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button onClick={() => void handleSendToStudents()} disabled={publishing || saving || roster.length === 0}>
                      <Send className="w-4 h-4 mr-2" />
                      {publishing ? 'Sending...' : 'Send to Students'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {activeTab === 'submit' && !isExamPeriod && (
          <div className="space-y-4">
            {!isWindowOpen && (
              <Alert variant="warning">The grade submission window for this period is currently closed.</Alert>
            )}
            <div className="bg-white border border-slate-300 rounded-card overflow-hidden">
              {loadingStatus ? (
                <div className="flex justify-center py-12"><Spinner size="lg" /></div>
              ) : submissionStatuses.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 text-sm">You are not assigned to any subjects in this class.</p>
                </div>
              ) : (
                <table className="min-w-full border-collapse">
                  <thead className="bg-secondary/20">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase border-r">Subject</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase border-r">Scores Saved</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase border-r">Weights</th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissionStatuses.map((s) => (
                      <tr key={s.subjectId} className="border-b hover:bg-slate-50/70">
                        <td className="px-4 py-3 text-sm font-bold text-slate-600 border-r">{s.subjectName}</td>
                        <td className="px-4 py-3 text-sm text-center border-r">{s.studentsScored}/{s.totalStudents}</td>
                        <td className={`px-4 py-3 text-sm text-center border-r ${Math.abs(s.weightsTotal - 100) < 0.01 ? 'text-slate-700' : 'text-amber-600 font-medium'}`}>{s.weightsTotal}%</td>
                        <td className="px-4 py-3 text-center">
                          {s.isReady ? (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Ready</span>
                          ) : (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Not ready — {s.notReadyReason}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void handleSubmitAllReady()} disabled={submittingAll || !isWindowOpen || readyCount === 0}>
                <Send className="w-4 h-4 mr-2" />
                {submittingAll ? 'Submitting...' : `Submit All Ready Subjects (${readyCount})`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
