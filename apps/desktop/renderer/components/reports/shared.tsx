import { sharedBridge } from '@/services/nemis-bridge/shared';
import { schoolAdminBridge } from '@/services/nemis-bridge/school-admin';
import type { ClassResult, SchoolAdminRecord, StudentListItemResult, TeacherResult, TeachingAssignmentResult } from '@nemis-desktop/types';
import { fetchAllPages } from '@/components/classes/shared';
import { gradeToLevel, LEVEL_LABEL, listFeeRules } from '@/components/finance/shared';
import { getGradingConfig, listPeriodsForTerm } from '@/components/academic-grading/shared';

export type ReportType = 'ENROLLMENT' | 'ATTENDANCE' | 'ACADEMIC' | 'STAFF_COMPLIANCE' | 'FINANCIAL';
export type AttendancePeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ScopeMode = 'SCHOOL' | 'LEVEL' | 'GRADE' | 'CLASS';

export interface ScopeSelection {
  mode: ScopeMode;
  level: string;
  gradeLevel: string;
  classId: string;
}

export const GRADE_SEQUENCE = [
  'KG', 'K1', 'K2', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6',
  'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12',
];

export function formatGradeLevel(g: string): string {
  return g.startsWith('GRADE_') ? `Grade ${g.slice(6)}` : g;
}

export const PERIOD_LABELS: Record<AttendancePeriod, string> = {
  DAILY: 'Last 7 Days',
  WEEKLY: 'Last 4 Weeks',
  MONTHLY: 'Last 3 Months',
};

/** Window length backing each period preset. Attendance has no server-side
 * range query (the bridge only supports one class + one date at a time — see
 * AttendanceViewModel), so a report window is built by querying every date in
 * range for every scoped class. These windows mirror portal-web's period
 * labels while keeping the call volume bounded for a local SQLite read. */
const PERIOD_WINDOW_DAYS: Record<AttendancePeriod, number> = { DAILY: 7, WEEKLY: 28, MONTHLY: 90 };

/** No ministry-defined teacher:student compliance ratio exists anywhere in
 * desktop's local data (fees/grading/attendance all have a real backing
 * table — this doesn't). Using a documented approximation rather than
 * fabricating a "real" threshold. */
const RATIO_COMPLIANCE_THRESHOLD = 40;

/** Positions counted as classroom-facing "teachers" for the ratio/coverage
 * stats, as opposed to non-teaching staff (librarian, counselor, admin,
 * support). */
const TEACHING_POSITIONS = new Set(['TEACHER', 'ASSISTANT_TEACHER', 'HEAD_OF_DEPARTMENT']);

export function isScopeIncomplete(scope: ScopeSelection): boolean {
  if (scope.mode === 'LEVEL') return !scope.level;
  if (scope.mode === 'GRADE') return !scope.gradeLevel;
  if (scope.mode === 'CLASS') return !scope.classId;
  return false;
}

export function resolveScopeClasses(classes: ClassResult[], scope: ScopeSelection): ClassResult[] {
  const active = classes.filter((c) => c.isActive);
  if (scope.mode === 'LEVEL') return active.filter((c) => gradeToLevel(c.gradeLevel) === scope.level);
  if (scope.mode === 'GRADE') return active.filter((c) => c.gradeLevel === scope.gradeLevel);
  if (scope.mode === 'CLASS') return active.filter((c) => c.id === scope.classId);
  return active;
}

export function scopeLabel(scope: ScopeSelection, classes: ClassResult[]): string {
  if (scope.mode === 'LEVEL') return scope.level ? `${LEVEL_LABEL[scope.level] ?? scope.level} Level` : 'School Level';
  if (scope.mode === 'GRADE') return scope.gradeLevel ? formatGradeLevel(scope.gradeLevel) : 'Grade Level';
  if (scope.mode === 'CLASS') {
    const cls = classes.find((c) => c.id === scope.classId);
    return cls ? `${cls.name}${cls.section ? ` — ${cls.section}` : ''}` : 'Class';
  }
  return 'Whole School';
}

export interface ClassAgg {
  classId: string;
  className: string;
  section: string | null;
  gradeLevel: string;
  capacity: number | null;
  enrolled: number;
  male: number;
  female: number;
  students: StudentListItemResult[];
}

/** One `listStudents({classId})` call per scoped class — the same real
 * pattern already used by finance/BulkAssignDrawer and timetable/shared, just
 * reused here to build enrollment/attendance/academic/financial aggregates
 * from a single roster fetch instead of re-querying per report type. Paged
 * through fetchAllPages since the IPC layer rejects any "limit" outside
 * 1–100 — a single oversized page request isn't allowed. */
export async function loadClassAggregates(classes: ClassResult[]): Promise<ClassAgg[]> {
  return Promise.all(
    classes.map(async (c) => {
      const students = await fetchAllPages((limit, offset) =>
        schoolAdminBridge.listStudents({ classId: c.id, isActive: true, limit, offset }),
      );
      return {
        classId: c.id,
        className: c.name,
        section: c.section ?? null,
        gradeLevel: c.gradeLevel,
        capacity: c.capacity ?? null,
        enrolled: students.length,
        male: students.filter((s) => s.gender === 'MALE').length,
        female: students.filter((s) => s.gender === 'FEMALE').length,
        students,
      };
    }),
  );
}

// ─── Enrollment ─────────────────────────────────────────────────────────────

export interface EnrollmentReportData {
  summary: { totalStudents: number; totalMale: number; totalFemale: number; genderRatio: string; classCount: number };
  byGradeLevel: { gradeLevel: string; male: number; female: number; total: number }[];
  byClass: {
    classId: string; className: string; section: string | null; gradeLevel: string;
    capacity: number | null; enrolled: number; male: number; female: number; utilization: number | null;
  }[];
}

export function buildEnrollmentReport(classAggs: ClassAgg[]): EnrollmentReportData {
  const totalMale = classAggs.reduce((sum, c) => sum + c.male, 0);
  const totalFemale = classAggs.reduce((sum, c) => sum + c.female, 0);
  const genderRatio = totalFemale > 0 ? `${(totalMale / totalFemale).toFixed(1)}:1` : totalMale > 0 ? `${totalMale}:0` : '0:0';

  const byGradeMap = new Map<string, { male: number; female: number; total: number }>();
  for (const c of classAggs) {
    const entry = byGradeMap.get(c.gradeLevel) ?? { male: 0, female: 0, total: 0 };
    entry.male += c.male;
    entry.female += c.female;
    entry.total += c.enrolled;
    byGradeMap.set(c.gradeLevel, entry);
  }
  const byGradeLevel = Array.from(byGradeMap.entries())
    .map(([gradeLevel, v]) => ({ gradeLevel, ...v }))
    .sort((a, b) => GRADE_SEQUENCE.indexOf(a.gradeLevel) - GRADE_SEQUENCE.indexOf(b.gradeLevel));

  const byClass = classAggs.map((c) => ({
    classId: c.classId, className: c.className, section: c.section, gradeLevel: c.gradeLevel,
    capacity: c.capacity, enrolled: c.enrolled, male: c.male, female: c.female,
    utilization: c.capacity && c.capacity > 0 ? Math.round((c.enrolled / c.capacity) * 100) : null,
  }));

  return {
    summary: { totalStudents: totalMale + totalFemale, totalMale, totalFemale, genderRatio, classCount: classAggs.length },
    byGradeLevel, byClass,
  };
}

// ─── Attendance ─────────────────────────────────────────────────────────────

export interface AttendanceReportData {
  period: { start: string; end: string; type: string };
  summary: {
    totalRecords: number; presentCount: number; absentCount: number; lateCount: number;
    excusedCount: number; sickCount: number; attendanceRate: number; classCount: number;
  };
  byClass: {
    classId: string; className: string; section: string | null; gradeLevel: string; enrolled: number;
    recordsCount: number; present: number; absent: number; late: number; excused: number; sick: number; attendanceRate: number;
  }[];
  trendData: { date: string; rate: number; present: number; absent: number }[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eachDateInRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    dates.push(isoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function trendBucketKey(date: string, period: AttendancePeriod): string {
  if (period === 'MONTHLY') return date.slice(0, 7);
  if (period === 'WEEKLY') {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - d.getDay());
    return isoDate(d);
  }
  return date;
}

export async function buildAttendanceReport(classAggs: ClassAgg[], period: AttendancePeriod): Promise<AttendanceReportData> {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (PERIOD_WINDOW_DAYS[period] - 1));
  const dates = eachDateInRange(start, end);

  const perClass = await Promise.all(
    classAggs.map(async (agg) => {
      const rows = (await Promise.all(dates.map((date) => sharedBridge.listAttendance({ classId: agg.classId, date })))).flat();
      const present = rows.filter((r) => r.status === 'PRESENT').length;
      const absent = rows.filter((r) => r.status === 'ABSENT').length;
      const late = rows.filter((r) => r.status === 'LATE').length;
      const excused = rows.filter((r) => r.status === 'EXCUSED').length;
      const sick = rows.filter((r) => r.status === 'SICK').length;
      const recordsCount = rows.length;
      const attendanceRate = recordsCount > 0 ? Math.round(((present + late) / recordsCount) * 100) : 0;
      return {
        classId: agg.classId, className: agg.className, section: agg.section, gradeLevel: agg.gradeLevel, enrolled: agg.enrolled,
        recordsCount, present, absent, late, excused, sick, attendanceRate, rows,
      };
    }),
  );

  const totals = perClass.reduce(
    (acc, c) => ({
      totalRecords: acc.totalRecords + c.recordsCount, presentCount: acc.presentCount + c.present,
      absentCount: acc.absentCount + c.absent, lateCount: acc.lateCount + c.late,
      excusedCount: acc.excusedCount + c.excused, sickCount: acc.sickCount + c.sick,
    }),
    { totalRecords: 0, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, sickCount: 0 },
  );
  const attendanceRate = totals.totalRecords > 0 ? Math.round(((totals.presentCount + totals.lateCount) / totals.totalRecords) * 100) : 0;

  const buckets = new Map<string, { present: number; absent: number; total: number }>();
  for (const c of perClass) {
    for (const r of c.rows) {
      const key = trendBucketKey(r.date, period);
      const entry = buckets.get(key) ?? { present: 0, absent: 0, total: 0 };
      if (r.status === 'PRESENT' || r.status === 'LATE') entry.present += 1;
      if (r.status === 'ABSENT') entry.absent += 1;
      entry.total += 1;
      buckets.set(key, entry);
    }
  }
  const trendData = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, rate: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0, present: v.present, absent: v.absent }));

  return {
    period: { start: isoDate(start), end: isoDate(end), type: period },
    summary: { ...totals, attendanceRate, classCount: classAggs.length },
    byClass: perClass.map((c) => ({
      classId: c.classId, className: c.className, section: c.section, gradeLevel: c.gradeLevel, enrolled: c.enrolled,
      recordsCount: c.recordsCount, present: c.present, absent: c.absent, late: c.late, excused: c.excused, sick: c.sick, attendanceRate: c.attendanceRate,
    })),
    trendData,
  };
}

// ─── Academic ───────────────────────────────────────────────────────────────

interface AcademicStats { totalGrades: number; averageScore: number; passRate: number; passCount: number; failCount: number }

export interface AcademicReportData {
  summary: AcademicStats & { gradedStudents: number };
  bySubject: (AcademicStats & { subjectId: string; subjectName: string })[];
  byClass: (AcademicStats & { classId: string; className: string; section: string | null; gradeLevel: string })[];
  byGender: { male: AcademicStats; female: AcademicStats };
}

function computeAcademicStats(rows: SchoolAdminRecord[], passThresholdPct: number): AcademicStats {
  const totalGrades = rows.length;
  const scores = rows.map((r) => Number(r.percentage ?? 0));
  const averageScore = totalGrades > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / totalGrades) * 10) / 10 : 0;
  const passCount = rows.filter((r) => Number(r.percentage ?? 0) >= passThresholdPct).length;
  const passRate = totalGrades > 0 ? Math.round((passCount / totalGrades) * 100) : 0;
  return { totalGrades, averageScore, passRate, passCount, failCount: totalGrades - passCount };
}

/** Only counts APPROVED/PUBLISHED grades — mirrors portal-web's note that
 * draft and unapproved submissions aren't reflected in the academic report. */
export async function buildAcademicReport(classAggs: ClassAgg[], termId: string): Promise<AcademicReportData> {
  const [periods, gradesResult, config, subjects] = await Promise.all([
    listPeriodsForTerm(termId),
    sharedBridge.listSchoolAdminRecords({ collection: 'grades', limit: 250 }),
    getGradingConfig(),
    fetchAllPages((limit, offset) => schoolAdminBridge.listSubjects({ limit, offset })),
  ]);

  const periodIds = new Set(periods.map((p) => String(p.id)));
  const classIds = new Set(classAggs.map((c) => c.classId));
  const maxMarks = Number(config?.maxMarks ?? 100) || 100;
  const passingMarks = Number(config?.passingMarks ?? 50);
  const passThresholdPct = (passingMarks / maxMarks) * 100;

  const relevant = gradesResult.items.filter(
    (g) => periodIds.has(String(g.gradingPeriodId)) && classIds.has(String(g.classId))
      && (g.status === 'APPROVED' || g.status === 'PUBLISHED'),
  );

  const genderByStudent = new Map<string, string>();
  for (const c of classAggs) for (const s of c.students) genderByStudent.set(s.id, s.gender);
  const subjectNames = new Map(subjects.map((s) => [s.id, s.name]));

  const overall = computeAcademicStats(relevant, passThresholdPct);
  const gradedStudents = new Set(relevant.map((r) => String(r.studentId))).size;

  const bySubjectMap = new Map<string, SchoolAdminRecord[]>();
  for (const r of relevant) {
    const key = String(r.subjectId);
    if (!bySubjectMap.has(key)) bySubjectMap.set(key, []);
    bySubjectMap.get(key)!.push(r);
  }
  const bySubject = Array.from(bySubjectMap.entries()).map(([subjectId, rows]) => ({
    subjectId, subjectName: subjectNames.get(subjectId) ?? 'Unknown Subject', ...computeAcademicStats(rows, passThresholdPct),
  }));

  const byClass = classAggs.map((c) => ({
    classId: c.classId, className: c.className, section: c.section, gradeLevel: c.gradeLevel,
    ...computeAcademicStats(relevant.filter((r) => String(r.classId) === c.classId), passThresholdPct),
  }));

  const maleRows = relevant.filter((r) => genderByStudent.get(String(r.studentId)) === 'MALE');
  const femaleRows = relevant.filter((r) => genderByStudent.get(String(r.studentId)) === 'FEMALE');

  return {
    summary: { ...overall, gradedStudents },
    bySubject, byClass,
    byGender: { male: computeAcademicStats(maleRows, passThresholdPct), female: computeAcademicStats(femaleRows, passThresholdPct) },
  };
}

// ─── Staff & Compliance ─────────────────────────────────────────────────────

export interface StaffReportData {
  summary: {
    totalStudents: number; totalStaff: number; totalTeachers: number; qualifiedTeachers: number;
    qualificationRate: number; teacherStudentRatio: string; isCompliant: boolean;
  };
  byPosition: { position: string; count: number }[];
  classAssignments: {
    classId: string; className: string; section: string | null; gradeLevel: string; enrolled: number;
    homeroomTeachers: string; subjectTeacherCount: number; hasNoTeacher: boolean;
  }[];
}

/** Desktop's `qualifications` field on a teacher record is a freeform,
 * unvalidated JSON bag (see TeacherResult) — not a fair basis for a
 * "qualified" stat. `approvalStatus` is the one real, screened workflow
 * signal desktop has for a teacher record, so it stands in here (surfaced in
 * the UI as "Approved" rather than "Qualified" to stay honest about what's
 * actually being measured). */
export async function buildStaffReport(classAggs: ClassAgg[]): Promise<StaffReportData> {
  const teachers = await fetchAllPages((limit, offset) => schoolAdminBridge.listTeachers({ isActive: true, limit, offset }));
  const teacherRows = teachers.filter((t) => TEACHING_POSITIONS.has(t.position));
  const totalTeachers = teacherRows.length;
  const approvedTeachers = teacherRows.filter((t) => t.approvalStatus === 'APPROVED').length;
  const qualificationRate = totalTeachers > 0 ? Math.round((approvedTeachers / totalTeachers) * 100) : 0;
  const totalStudents = classAggs.reduce((sum, c) => sum + c.enrolled, 0);
  const ratio = totalTeachers > 0 ? totalStudents / totalTeachers : 0;

  const byPositionMap = new Map<string, number>();
  for (const t of teachers) byPositionMap.set(t.position, (byPositionMap.get(t.position) ?? 0) + 1);
  const byPosition = Array.from(byPositionMap.entries()).map(([position, count]) => ({ position, count }));

  const classAssignments = await Promise.all(
    classAggs.map(async (c) => {
      const classTeachers = await fetchAllPages((limit, offset) =>
        schoolAdminBridge.listTeachers({ classId: c.classId, isActive: true, limit, offset }),
      );
      const assignmentLists = await Promise.all(classTeachers.map((t) => schoolAdminBridge.listTeachingAssignments(t.id)));
      const assignments: (TeachingAssignmentResult & { teacher: TeacherResult })[] = [];
      classTeachers.forEach((teacher, i) => {
        for (const a of assignmentLists[i] ?? []) if (a.classId === c.classId) assignments.push({ ...a, teacher });
      });
      const homeroom = assignments.filter((a) => a.isClassTeacher);
      const homeroomTeachers = Array.from(new Set(homeroom.map((a) => `${a.teacher.firstName} ${a.teacher.lastName}`))).join(', ');
      return {
        classId: c.classId, className: c.className, section: c.section, gradeLevel: c.gradeLevel, enrolled: c.enrolled,
        homeroomTeachers, subjectTeacherCount: assignments.filter((a) => !a.isClassTeacher).length, hasNoTeacher: homeroom.length === 0,
      };
    }),
  );

  return {
    summary: {
      totalStudents, totalStaff: teachers.length, totalTeachers, qualifiedTeachers: approvedTeachers, qualificationRate,
      teacherStudentRatio: totalTeachers > 0 ? Math.round(ratio).toString() : '0',
      isCompliant: totalTeachers === 0 || ratio <= RATIO_COMPLIANCE_THRESHOLD,
    },
    byPosition, classAssignments,
  };
}

// ─── Financial ──────────────────────────────────────────────────────────────

export interface FinancialReportData {
  summary: { totalExpected: number; totalCollected: number; totalOutstanding: number; totalWaived: number; collectionRate: number; currency: string };
  paymentStatus: { paid: number; partial: number; unpaid: number; waived: number; studentsWithoutObligations: number };
  byFeeRule: { feeRuleId: string; name: string; category: string; expected: number; collected: number; outstanding: number; collectionRate: number }[];
  byClass: { classId: string; className: string; section: string | null; gradeLevel: string; studentCount: number; expected: number; collected: number; outstanding: number; collectionRate: number }[];
  transactions: { id: string; paidAt: string; studentName: string; feeRuleName: string; amount: number; method: string; receiptNumber: string; recordedByName: string; isReversed: boolean }[];
}

function summarizeObligations(rows: SchoolAdminRecord[]) {
  let expected = 0, collected = 0, waived = 0;
  for (const o of rows) {
    const required = Number(o.requiredAmount ?? 0);
    collected += Number(o.totalPaid ?? 0);
    if (o.status === 'WAIVED') waived += required; else expected += required;
  }
  const outstanding = Math.max(0, expected - collected);
  return { expected, collected, outstanding, waived, collectionRate: expected > 0 ? Math.round((collected / expected) * 100) : 0 };
}

/** `recordedBy` is currently persisted blank by the desktop payment form (see
 * finance/shared.tsx's recordPayment) — there's no signed-in staff identity
 * threaded through yet, so the ledger honestly shows "—" rather than
 * fabricating a name. `isReversed` is a real schema column that's always
 * false in practice, since fee_payments are server-enforced append-only. */
export async function buildFinancialReport(classAggs: ClassAgg[], termId: string | null): Promise<FinancialReportData> {
  const [rules, obligationsResult, paymentsResult] = await Promise.all([
    listFeeRules(),
    sharedBridge.listSchoolAdminRecords({ collection: 'fee_obligations', limit: 250 }),
    sharedBridge.listSchoolAdminRecords({ collection: 'fee_payments', limit: 250 }),
  ]);

  const studentClassMap = new Map<string, string>();
  const studentNameMap = new Map<string, string>();
  for (const c of classAggs) for (const s of c.students) { studentClassMap.set(s.id, c.classId); studentNameMap.set(s.id, s.fullName); }
  const ruleMap = new Map(rules.map((r) => [String(r.id), r]));

  const obligations = obligationsResult.items.filter(
    (o) => studentClassMap.has(String(o.studentId)) && (!termId || String(o.termId) === termId),
  );

  const overall = summarizeObligations(obligations);

  const byStudent = new Map<string, SchoolAdminRecord[]>();
  for (const o of obligations) {
    const key = String(o.studentId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key)!.push(o);
  }
  let paid = 0, partial = 0, unpaid = 0, waivedCount = 0;
  for (const rows of byStudent.values()) {
    if (rows.some((r) => r.status === 'OUTSTANDING')) unpaid += 1;
    else if (rows.some((r) => r.status === 'PARTIALLY_PAID')) partial += 1;
    else if (rows.every((r) => r.status === 'WAIVED')) waivedCount += 1;
    else paid += 1;
  }
  const totalStudentsInScope = classAggs.reduce((sum, c) => sum + c.enrolled, 0);

  const byFeeRuleMap = new Map<string, SchoolAdminRecord[]>();
  for (const o of obligations) {
    const key = String(o.feeRuleId);
    if (!byFeeRuleMap.has(key)) byFeeRuleMap.set(key, []);
    byFeeRuleMap.get(key)!.push(o);
  }
  const byFeeRule = Array.from(byFeeRuleMap.entries()).map(([feeRuleId, rows]) => {
    const rule = ruleMap.get(feeRuleId);
    const s = summarizeObligations(rows);
    return { feeRuleId, name: rule?.name ? String(rule.name) : 'Unknown Rule', category: rule?.category ? String(rule.category) : 'OTHER', ...s };
  });

  const byClass = classAggs.map((c) => {
    const rows = obligations.filter((o) => studentClassMap.get(String(o.studentId)) === c.classId);
    const s = summarizeObligations(rows);
    return { classId: c.classId, className: c.className, section: c.section, gradeLevel: c.gradeLevel, studentCount: new Set(rows.map((r) => r.studentId)).size, ...s };
  });

  const obligationIds = new Set(obligations.map((o) => String(o.id)));
  const transactions = paymentsResult.items
    .filter((p) => obligationIds.has(String(p.obligationId)))
    .map((p) => {
      const obligation = obligations.find((o) => String(o.id) === String(p.obligationId));
      const rule = obligation ? ruleMap.get(String(obligation.feeRuleId)) : undefined;
      return {
        id: String(p.id), paidAt: String(p.paidAt), studentName: studentNameMap.get(String(p.studentId)) ?? 'Unknown Student',
        feeRuleName: rule?.name ? String(rule.name) : 'Unknown Rule', amount: Number(p.amount ?? 0), method: String(p.method ?? ''),
        receiptNumber: String(p.receiptNumber ?? ''), recordedByName: p.recordedBy ? String(p.recordedBy) : '—', isReversed: Boolean(p.isReversed),
      };
    })
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  return {
    summary: { totalExpected: overall.expected, totalCollected: overall.collected, totalOutstanding: overall.outstanding, totalWaived: overall.waived, collectionRate: overall.collectionRate, currency: 'LRD' },
    paymentStatus: { paid, partial, unpaid, waived: waivedCount, studentsWithoutObligations: Math.max(0, totalStudentsInScope - byStudent.size) },
    byFeeRule, byClass, transactions,
  };
}

// ─── CSV export ─────────────────────────────────────────────────────────────

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Presentation primitives ────────────────────────────────────────────────

export function SummaryCard({ label, value, valueClassName, suffix }: { label: string; value: number | string; valueClassName?: string; suffix?: string }) {
  return (
    <div className="overflow-hidden border border-slate-300 bg-white p-4">
      <p className="mb-2 truncate text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`truncate text-2xl font-bold ${valueClassName ?? 'text-slate-900'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="ml-1 text-sm font-normal text-slate-400">{suffix}</span>}
      </p>
    </div>
  );
}

export function ReportTable({ title, headers, alignments, children }: { title: string; headers: string[]; alignments: ('left' | 'right' | 'center')[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden border border-slate-300 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400 text-${alignments[i]}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function ReportEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border border-slate-300 bg-white p-12 text-center">
      <p className="mb-1 text-sm font-semibold text-slate-500">{title}</p>
      <p className="mx-auto max-w-sm text-xs text-slate-400">{detail}</p>
    </div>
  );
}

const CHART_COLORS = { secondary: '#0367A0', active: '#146316', pending: '#a6731c', error: '#c10021', accent: '#1874A8', slate: '#CBD5E1' };

/** Hand-rolled horizontal bar chart — no charting library ships with the
 * desktop renderer (same constraint that pushed Timetable's export to plain
 * CSV), so this is inline SVG built directly from the same real numbers the
 * table below it renders. */
export function BarListChart({ data, unit, color = CHART_COLORS.secondary }: { data: { label: string; value: number }[]; unit?: string; color?: string }) {
  if (data.length === 0) return <p className="py-8 text-center text-xs text-slate-400">No data.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-xs">
          <span className="w-32 shrink-0 truncate text-slate-500" title={d.label}>{d.label}</span>
          <div className="h-3 flex-1 bg-slate-100">
            <div className="h-3" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: color }} />
          </div>
          <span className="w-14 shrink-0 text-right font-semibold text-slate-700">{d.value.toLocaleString()}{unit ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

/** Hand-rolled donut chart (SVG stroke-dasharray segments) standing in for
 * portal-web's recharts PieChart, same "no charting library" constraint as
 * BarListChart above. */
export function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const filtered = segments.filter((s) => s.value > 0);
  const total = filtered.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return <p className="py-8 text-center text-xs text-slate-400">No data.</p>;
  const radius = 15.9155;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 36 36" className="h-32 w-32 shrink-0 -rotate-90">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="6" />
        {filtered.map((s) => {
          const length = (s.value / total) * circumference;
          const dasharray = `${length} ${circumference - length}`;
          const dashoffset = -offset;
          offset += length;
          return (
            <circle key={s.label} cx="18" cy="18" r={radius} fill="none" stroke={s.color} strokeWidth="6"
              strokeDasharray={dasharray} strokeDashoffset={dashoffset} />
          );
        })}
      </svg>
      <div className="space-y-1.5">
        {filtered.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-slate-500">{s.label}</span>
            <span className="font-semibold text-slate-700">{s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { CHART_COLORS };
