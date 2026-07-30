'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar, ClipboardCheck, Download, FileText, GraduationCap, RefreshCw, Search, Users, DollarSign, AlertTriangle,
} from 'lucide-react';
import { Spinner } from '@nemis-desktop/ui';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { useViewModel } from '@/hooks/use-view-model';
import { hasData } from '@nemis-desktop/presentation';
import { schoolAdminBridge } from '@/services/nemis-bridge/school-admin';
import type { SchoolSummaryResult } from '@nemis-desktop/types';
import { LEVEL_LABEL, formatCurrency } from '@/components/finance/shared';
import {
  type ReportType, type AttendancePeriod, type ScopeMode, type ScopeSelection,
  type EnrollmentReportData, type AttendanceReportData, type AcademicReportData, type StaffReportData, type FinancialReportData,
  GRADE_SEQUENCE, PERIOD_LABELS, formatGradeLevel, isScopeIncomplete, resolveScopeClasses, scopeLabel,
  loadClassAggregates, buildEnrollmentReport, buildAttendanceReport, buildAcademicReport, buildStaffReport, buildFinancialReport,
  downloadCsv, SummaryCard, ReportTable, ReportEmptyState, BarListChart, DonutChart, CHART_COLORS,
} from './shared';

const REPORT_TYPES: { id: ReportType; name: string; icon: typeof Users }[] = [
  { id: 'ENROLLMENT', name: 'Enrollment', icon: Users },
  { id: 'ATTENDANCE', name: 'Attendance', icon: Calendar },
  { id: 'ACADEMIC', name: 'Academic', icon: GraduationCap },
  { id: 'STAFF_COMPLIANCE', name: 'Staff & Compliance', icon: ClipboardCheck },
  { id: 'FINANCIAL', name: 'Financial', icon: DollarSign },
];

type ReportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; type: 'ENROLLMENT'; data: EnrollmentReportData; label: string; generatedAt: string }
  | { status: 'success'; type: 'ATTENDANCE'; data: AttendanceReportData; label: string; generatedAt: string }
  | { status: 'success'; type: 'ACADEMIC'; data: AcademicReportData; label: string; termName: string; generatedAt: string }
  | { status: 'success'; type: 'STAFF_COMPLIANCE'; data: StaffReportData; generatedAt: string }
  | { status: 'success'; type: 'FINANCIAL'; data: FinancialReportData; label: string; termName: string; generatedAt: string };

export function ReportsPage() {
  const foundation = useAcademicFoundationViewModel();
  const classesState = useViewModel(foundation.store, (s) => s.classes);
  const academicYearsState = useViewModel(foundation.store, (s) => s.academicYears);
  const termsState = useViewModel(foundation.store, (s) => s.terms);
  const currentTermState = useViewModel(foundation.store, (s) => s.currentTerm);

  const [school, setSchool] = useState<SchoolSummaryResult | null>(null);
  const [selectedReport, setSelectedReport] = useState<ReportType>('ENROLLMENT');
  const [scopeMode, setScopeMode] = useState<ScopeMode>('SCHOOL');
  const [level, setLevel] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [classId, setClassId] = useState('');
  const [attendancePeriod, setAttendancePeriod] = useState<AttendancePeriod>('WEEKLY');
  const [academicYearId, setAcademicYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [reportState, setReportState] = useState<ReportState>({ status: 'idle' });

  useEffect(() => {
    foundation.loadClasses();
    foundation.loadAcademicYears();
    foundation.loadCurrentTerm();
    schoolAdminBridge.getSchoolSummary().then(setSchool).catch(() => setSchool(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classes = useMemo(() => (hasData(classesState) ? [...classesState.data] : []), [classesState]);
  const academicYears = useMemo(() => (hasData(academicYearsState) ? [...academicYearsState.data] : []), [academicYearsState]);
  const terms = useMemo(() => (hasData(termsState) ? [...termsState.data] : []), [termsState]);
  const currentTerm = hasData(currentTermState) ? currentTermState.data : null;

  const activeClasses = useMemo(() => classes.filter((c) => c.isActive), [classes]);
  const availableGrades = useMemo(
    () => Array.from(new Set(activeClasses.map((c) => c.gradeLevel))).sort((a, b) => GRADE_SEQUENCE.indexOf(a) - GRADE_SEQUENCE.indexOf(b)),
    [activeClasses],
  );
  const showTermFilters = selectedReport === 'ACADEMIC' || selectedReport === 'FINANCIAL';
  const showScopeSelector = selectedReport !== 'STAFF_COMPLIANCE';

  const scope: ScopeSelection = useMemo(() => ({ mode: scopeMode, level, gradeLevel, classId }), [scopeMode, level, gradeLevel, classId]);
  const scopeIncomplete = showScopeSelector && isScopeIncomplete(scope);

  useEffect(() => {
    if (academicYearId) foundation.loadTerms(academicYearId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYearId]);

  const generate = useCallback(async () => {
    if (!hasData(classesState)) return;
    if (scopeIncomplete) { setReportState({ status: 'idle' }); return; }
    setReportState({ status: 'loading' });
    try {
      const generatedAt = new Date().toISOString();
      if (selectedReport === 'STAFF_COMPLIANCE') {
        const aggs = await loadClassAggregates(activeClasses);
        const data = await buildStaffReport(aggs);
        setReportState({ status: 'success', type: 'STAFF_COMPLIANCE', data, generatedAt });
        return;
      }
      const scopedClasses = resolveScopeClasses(classes, scope);
      const label = scopeLabel(scope, classes);
      if (selectedReport === 'ENROLLMENT') {
        const aggs = await loadClassAggregates(scopedClasses);
        setReportState({ status: 'success', type: 'ENROLLMENT', data: buildEnrollmentReport(aggs), label, generatedAt });
      } else if (selectedReport === 'ATTENDANCE') {
        const aggs = await loadClassAggregates(scopedClasses);
        const data = await buildAttendanceReport(aggs, attendancePeriod);
        setReportState({ status: 'success', type: 'ATTENDANCE', data, label, generatedAt });
      } else if (selectedReport === 'ACADEMIC') {
        const effectiveTermId = termId || currentTerm?.id;
        if (!effectiveTermId) { setReportState({ status: 'error', message: 'No term is set as current. Choose a year and term to generate this report.' }); return; }
        const aggs = await loadClassAggregates(scopedClasses);
        const data = await buildAcademicReport(aggs, effectiveTermId);
        const termName = terms.find((t) => t.id === effectiveTermId)?.name ?? currentTerm?.name ?? 'Current Term';
        setReportState({ status: 'success', type: 'ACADEMIC', data, label, termName, generatedAt });
      } else if (selectedReport === 'FINANCIAL') {
        const aggs = await loadClassAggregates(scopedClasses);
        const data = await buildFinancialReport(aggs, termId || null);
        const termName = termId ? (terms.find((t) => t.id === termId)?.name ?? 'Selected Term') : 'All Terms';
        setReportState({ status: 'success', type: 'FINANCIAL', data, label, termName, generatedAt });
      }
    } catch (cause) {
      setReportState({ status: 'error', message: cause instanceof Error ? cause.message : 'Failed to generate report.' });
    }
  }, [classesState, classes, scope, scopeIncomplete, selectedReport, attendancePeriod, termId, currentTerm, terms, activeClasses]);

  useEffect(() => { generate(); }, [generate]);

  const isLoading = reportState.status === 'loading';

  const handleExport = () => {
    if (reportState.status !== 'success') return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (reportState.type === 'ENROLLMENT') {
      downloadCsv(`enrollment-report-${stamp}.csv`, ['Class', 'Grade', 'Enrolled', 'Male', 'Female', 'Capacity', 'Utilization %'],
        reportState.data.byClass.map((c) => [`${c.className}${c.section ? ` — ${c.section}` : ''}`, formatGradeLevel(c.gradeLevel), c.enrolled, c.male, c.female, c.capacity ?? '', c.utilization ?? '']));
    } else if (reportState.type === 'ATTENDANCE') {
      downloadCsv(`attendance-report-${stamp}.csv`, ['Class', 'Enrolled', 'Records', 'Present', 'Absent', 'Late', 'Excused', 'Sick', 'Rate %'],
        reportState.data.byClass.map((c) => [`${c.className}${c.section ? ` — ${c.section}` : ''}`, c.enrolled, c.recordsCount, c.present, c.absent, c.late, c.excused, c.sick, c.attendanceRate]));
    } else if (reportState.type === 'ACADEMIC') {
      downloadCsv(`academic-report-${stamp}.csv`, ['Class', 'Grade', 'Grades', 'Avg Score %', 'Pass Rate %'],
        reportState.data.byClass.map((c) => [`${c.className}${c.section ? ` — ${c.section}` : ''}`, formatGradeLevel(c.gradeLevel), c.totalGrades, c.averageScore, c.passRate]));
    } else if (reportState.type === 'STAFF_COMPLIANCE') {
      downloadCsv(`staff-report-${stamp}.csv`, ['Class', 'Grade', 'Enrolled', 'Homeroom Teacher(s)', 'Subject Teachers', 'Coverage'],
        reportState.data.classAssignments.map((c) => [`${c.className}${c.section ? ` — ${c.section}` : ''}`, formatGradeLevel(c.gradeLevel), c.enrolled, c.homeroomTeachers || '—', c.subjectTeacherCount, c.hasNoTeacher ? 'No Teacher' : 'Covered']));
    } else if (reportState.type === 'FINANCIAL') {
      downloadCsv(`financial-report-${stamp}.csv`, ['Date', 'Student', 'Fee Rule', 'Amount', 'Method', 'Receipt #', 'Recorded By', 'Status'],
        reportState.data.transactions.map((t) => [new Date(t.paidAt).toLocaleDateString(), t.studentName, t.feeRuleName, t.amount, t.method.replaceAll('_', ' '), t.receiptNumber, t.recordedByName, t.isReversed ? 'Reversed' : 'Posted']));
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-slate-900 px-6 py-5 text-white">
        <div>
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">{school?.name || 'School Reports'}</p>
          <h1 className="text-xl font-bold text-white">Generate Reports</h1>
        </div>
        {school?.code && (
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">{school.code}</div>
        )}
      </div>

      <div className="py-6">
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Filter sidebar */}
          <div className="w-full shrink-0 lg:w-56">
            <div className="sticky top-6 space-y-5 border border-slate-300 bg-white p-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                <Search className="h-3.5 w-3.5" /> Filters
              </p>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Report Type</label>
                <div className="space-y-1">
                  {REPORT_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isSelected = selectedReport === type.id;
                    return (
                      <button key={type.id} onClick={() => setSelectedReport(type.id)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${isSelected ? 'bg-secondary font-medium text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {type.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {showScopeSelector && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">Scope</label>
                  <select value={scopeMode} onChange={(e) => { setScopeMode(e.target.value as ScopeMode); setLevel(''); setGradeLevel(''); setClassId(''); }}
                    className="w-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-secondary">
                    <option value="SCHOOL">Whole School</option>
                    <option value="LEVEL">School Level</option>
                    <option value="GRADE">Grade Level</option>
                    <option value="CLASS">Class</option>
                  </select>

                  {scopeMode === 'LEVEL' && (
                    <select value={level} onChange={(e) => setLevel(e.target.value)}
                      className="w-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-secondary">
                      <option value="">— Choose level —</option>
                      {Object.entries(LEVEL_LABEL).filter(([key]) => ['PRE_PRIMARY', 'PRIMARY', 'SECONDARY'].includes(key)).map(([key, lbl]) => (
                        <option key={key} value={key}>{lbl}</option>
                      ))}
                    </select>
                  )}

                  {scopeMode === 'GRADE' && (
                    <select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}
                      className="w-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-secondary">
                      <option value="">— Choose grade —</option>
                      {availableGrades.map((g) => <option key={g} value={g}>{formatGradeLevel(g)}</option>)}
                    </select>
                  )}

                  {scopeMode === 'CLASS' && (
                    <select value={classId} onChange={(e) => setClassId(e.target.value)}
                      className="w-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-secondary">
                      <option value="">— Choose class —</option>
                      {activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` — ${c.section}` : ''}</option>)}
                    </select>
                  )}
                </div>
              )}

              {selectedReport === 'ATTENDANCE' && (
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Time Period</label>
                  <div className="space-y-1">
                    {(['DAILY', 'WEEKLY', 'MONTHLY'] as AttendancePeriod[]).map((period) => (
                      <button key={period} onClick={() => setAttendancePeriod(period)}
                        className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${attendancePeriod === period ? 'bg-secondary font-medium text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                        {PERIOD_LABELS[period]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showTermFilters && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">Year &amp; Term</label>
                  <select value={academicYearId} onChange={(e) => { setAcademicYearId(e.target.value); setTermId(''); }}
                    className="w-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-secondary">
                    <option value="">Current Year</option>
                    {academicYears.map((y) => <option key={y.id} value={y.id}>{y.code}</option>)}
                  </select>
                  <select value={termId} onChange={(e) => setTermId(e.target.value)}
                    className="w-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-secondary">
                    <option value="">{selectedReport === 'FINANCIAL' ? 'All Terms' : 'Current Term'}</option>
                    {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-400">Export</label>
                <button onClick={handleExport} disabled={reportState.status !== 'success'}
                  className="flex w-full items-center gap-2 border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>

              <button onClick={generate} disabled={isLoading}
                className="flex w-full items-center gap-2 border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
          </div>

          {/* Main content */}
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex flex-col gap-2 border border-slate-300 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">{REPORT_TYPES.find((t) => t.id === selectedReport)?.name} Report</span>
                {reportState.status === 'success' && (
                  <>
                    <span className="text-sm text-slate-400">— {reportState.type === 'STAFF_COMPLIANCE' ? 'Whole School' : reportState.label}</span>
                    <span className="text-xs text-slate-400">&middot; {new Date(reportState.generatedAt).toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>

            {scopeIncomplete && (
              <ReportEmptyState title="Choose a scope" detail="Select a level, grade, or class to generate this report." />
            )}

            {!scopeIncomplete && isLoading && (
              <div className="flex items-center justify-center gap-3 border border-slate-300 bg-white py-12">
                <Spinner size="lg" />
                <span className="text-sm text-slate-500">Generating {REPORT_TYPES.find((t) => t.id === selectedReport)?.name.toLowerCase()} report…</span>
              </div>
            )}

            {!scopeIncomplete && reportState.status === 'error' && (
              <div className="flex items-start gap-3 border border-red-100 bg-red-50 px-5 py-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Failed to load report</p>
                  <p className="mt-0.5 text-xs text-red-500">{reportState.message}</p>
                </div>
              </div>
            )}

            {!scopeIncomplete && reportState.status === 'success' && reportState.type === 'ENROLLMENT' && <EnrollmentView data={reportState.data} />}
            {!scopeIncomplete && reportState.status === 'success' && reportState.type === 'ATTENDANCE' && <AttendanceView data={reportState.data} />}
            {!scopeIncomplete && reportState.status === 'success' && reportState.type === 'ACADEMIC' && <AcademicView data={reportState.data} termName={reportState.termName} />}
            {!scopeIncomplete && reportState.status === 'success' && reportState.type === 'STAFF_COMPLIANCE' && <StaffView data={reportState.data} />}
            {!scopeIncomplete && reportState.status === 'success' && reportState.type === 'FINANCIAL' && <FinancialView data={reportState.data} termName={reportState.termName} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function EnrollmentView({ data }: { data: EnrollmentReportData }) {
  if (data.summary.classCount === 0) return <ReportEmptyState title="No classes in this scope" detail="There are no active classes for this scope." />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 2xl:grid-cols-5">
        <SummaryCard label="Classes" value={data.summary.classCount} />
        <SummaryCard label="Total Students" value={data.summary.totalStudents} />
        <SummaryCard label="Male" value={data.summary.totalMale} valueClassName="text-secondary" />
        <SummaryCard label="Female" value={data.summary.totalFemale} valueClassName="text-pending" />
        <SummaryCard label="Gender Ratio" value={data.summary.genderRatio} suffix="M:F" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="border border-slate-300 bg-white p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Gender Distribution</p>
          <DonutChart segments={[{ label: 'Male', value: data.summary.totalMale, color: CHART_COLORS.secondary }, { label: 'Female', value: data.summary.totalFemale, color: CHART_COLORS.pending }]} />
        </div>
        <div className="border border-slate-300 bg-white p-5 lg:col-span-2">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">By Grade Level</p>
          <BarListChart data={data.byGradeLevel.map((g) => ({ label: formatGradeLevel(g.gradeLevel), value: g.total }))} />
        </div>
      </div>
      <div className="border border-slate-300 bg-white p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Enrollment by Class</p>
        <BarListChart data={data.byClass.map((c) => ({ label: c.section ? `${c.className} — ${c.section}` : c.className, value: c.enrolled }))} />
      </div>
      <ReportTable title="Enrollment by Class" headers={['Class', 'Grade', 'Enrolled', 'Male', 'Female', 'Capacity', 'Utilization']} alignments={['left', 'left', 'right', 'right', 'right', 'right', 'right']}>
        {data.byClass.map((c) => (
          <tr key={c.classId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{c.className}{c.section ? ` — ${c.section}` : ''}</td>
            <td className="px-4 py-3 text-slate-500">{formatGradeLevel(c.gradeLevel)}</td>
            <td className="px-4 py-3 text-right font-semibold text-slate-800">{c.enrolled.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-secondary">{c.male.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-pending">{c.female.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-slate-600">{c.capacity ?? '—'}</td>
            <td className="px-4 py-3 text-right">
              {c.utilization === null ? <span className="text-slate-400">—</span> : (
                <span className={`px-2 py-0.5 text-xs font-semibold text-white ${c.utilization > 100 ? 'bg-error' : c.utilization >= 80 ? 'bg-pending' : 'bg-active'}`}>{c.utilization}%</span>
              )}
            </td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}

function AttendanceView({ data }: { data: AttendanceReportData }) {
  if (data.summary.classCount === 0) return <ReportEmptyState title="No classes in this scope" detail="There are no active classes for this scope." />;
  if (data.summary.totalRecords === 0) {
    return <ReportEmptyState title="No attendance records" detail={`No attendance was recorded between ${new Date(data.period.start).toLocaleDateString()} and ${new Date(data.period.end).toLocaleDateString()}.`} />;
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 2xl:grid-cols-7">
        <SummaryCard label="Classes" value={data.summary.classCount} />
        <SummaryCard label="Records" value={data.summary.totalRecords} />
        <SummaryCard label="Present" value={data.summary.presentCount} valueClassName="text-active" />
        <SummaryCard label="Absent" value={data.summary.absentCount} valueClassName="text-error" />
        <SummaryCard label="Late" value={data.summary.lateCount} valueClassName="text-pending" />
        <SummaryCard label="Excused / Sick" value={data.summary.excusedCount + data.summary.sickCount} valueClassName="text-secondary" />
        <SummaryCard label="Attendance Rate" value={data.summary.attendanceRate} suffix="%" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border border-slate-300 bg-white p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Attendance Status</p>
          <DonutChart segments={[
            { label: 'Present', value: data.summary.presentCount, color: CHART_COLORS.active },
            { label: 'Absent', value: data.summary.absentCount, color: CHART_COLORS.error },
            { label: 'Late', value: data.summary.lateCount, color: CHART_COLORS.pending },
            { label: 'Excused', value: data.summary.excusedCount, color: CHART_COLORS.secondary },
            { label: 'Sick', value: data.summary.sickCount, color: CHART_COLORS.accent },
          ]} />
        </div>
        <div className="border border-slate-300 bg-white p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Attendance Trend</p>
          <BarListChart data={data.trendData.map((t) => ({ label: new Date(t.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), value: t.rate }))} unit="%" color={CHART_COLORS.active} />
        </div>
      </div>
      <ReportTable title="Attendance by Class" headers={['Class', 'Enrolled', 'Records', 'Present', 'Absent', 'Late', 'Excused', 'Sick', 'Rate']}
        alignments={['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']}>
        {data.byClass.map((c) => (
          <tr key={c.classId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{c.className}{c.section ? ` — ${c.section}` : ''}</td>
            <td className="px-4 py-3 text-right text-slate-600">{c.enrolled.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-slate-600">{c.recordsCount.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-active">{c.present.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-error">{c.absent.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-pending">{c.late.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-secondary">{c.excused.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-slate-600">{c.sick.toLocaleString()}</td>
            <td className="px-4 py-3 text-right">
              <span className={`px-2 py-0.5 text-xs font-semibold text-white ${c.attendanceRate >= 90 ? 'bg-active' : c.attendanceRate >= 75 ? 'bg-pending' : 'bg-error'}`}>{c.attendanceRate}%</span>
            </td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}

function AcademicView({ data, termName }: { data: AcademicReportData; termName: string }) {
  if (data.summary.totalGrades === 0) {
    return <ReportEmptyState title="No published grades" detail={`No approved or published grades exist for this scope in ${termName}. Draft and unapproved submissions are not counted.`} />;
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard label="Grades Recorded" value={data.summary.totalGrades} />
        <SummaryCard label="Students Graded" value={data.summary.gradedStudents} />
        <SummaryCard label="Avg Score" value={data.summary.averageScore} suffix="%" valueClassName="text-secondary" />
        <SummaryCard label="Pass Rate" value={data.summary.passRate} suffix="%" valueClassName="text-active" />
        <SummaryCard label="Passed" value={data.summary.passCount} valueClassName="text-active" />
        <SummaryCard label="Failed" value={data.summary.failCount} valueClassName="text-error" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="border border-slate-300 bg-white p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Pass / Fail</p>
          <DonutChart segments={[{ label: 'Passed', value: data.summary.passCount, color: CHART_COLORS.active }, { label: 'Failed', value: data.summary.failCount, color: CHART_COLORS.error }]} />
        </div>
        <div className="border border-slate-300 bg-white p-5 lg:col-span-2">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Subject Performance</p>
          <BarListChart data={data.bySubject.map((s) => ({ label: s.subjectName, value: s.averageScore }))} unit="%" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Male Avg Score" value={data.byGender.male.averageScore} suffix="%" valueClassName="text-secondary" />
        <SummaryCard label="Male Pass Rate" value={data.byGender.male.passRate} suffix="%" valueClassName="text-secondary" />
        <SummaryCard label="Female Avg Score" value={data.byGender.female.averageScore} suffix="%" valueClassName="text-pending" />
        <SummaryCard label="Female Pass Rate" value={data.byGender.female.passRate} suffix="%" valueClassName="text-pending" />
      </div>
      <div className="border border-slate-300 bg-white p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Average Score by Class</p>
        <BarListChart data={data.byClass.filter((c) => c.totalGrades > 0).map((c) => ({ label: c.section ? `${c.className} — ${c.section}` : c.className, value: c.averageScore }))} unit="%" />
      </div>
      <ReportTable title="Performance by Class" headers={['Class', 'Grade', 'Grades', 'Avg Score', 'Pass Rate']} alignments={['left', 'left', 'right', 'right', 'right']}>
        {data.byClass.map((c) => (
          <tr key={c.classId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{c.className}{c.section ? ` — ${c.section}` : ''}</td>
            <td className="px-4 py-3 text-slate-500">{formatGradeLevel(c.gradeLevel)}</td>
            <td className="px-4 py-3 text-right text-slate-600">{c.totalGrades.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-slate-600">{c.totalGrades > 0 ? `${c.averageScore}%` : '—'}</td>
            <td className="px-4 py-3 text-right">
              {c.totalGrades > 0 ? (
                <span className={`px-2 py-0.5 text-xs font-semibold text-white ${c.passRate >= 80 ? 'bg-active' : c.passRate >= 60 ? 'bg-pending' : 'bg-error'}`}>{c.passRate}%</span>
              ) : <span className="text-slate-400">—</span>}
            </td>
          </tr>
        ))}
      </ReportTable>
      <ReportTable title="Performance by Subject" headers={['Subject', 'Grades', 'Avg Score', 'Pass Rate']} alignments={['left', 'right', 'right', 'right']}>
        {data.bySubject.map((s) => (
          <tr key={s.subjectId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{s.subjectName}</td>
            <td className="px-4 py-3 text-right text-slate-600">{s.totalGrades.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-slate-600">{s.averageScore}%</td>
            <td className="px-4 py-3 text-right text-slate-600">{s.passRate}%</td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}

function StaffView({ data }: { data: StaffReportData }) {
  if (data.summary.totalStaff === 0) return <ReportEmptyState title="No active staff" detail="There are no active staff records for this school." />;
  const uncovered = data.classAssignments.filter((c) => c.hasNoTeacher).length;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Total Students" value={data.summary.totalStudents} />
        <SummaryCard label="Total Staff" value={data.summary.totalStaff} />
        <SummaryCard label="Teachers" value={data.summary.totalTeachers} />
        <SummaryCard label="Teacher:Student" value={`1:${data.summary.teacherStudentRatio}`} valueClassName={data.summary.isCompliant ? 'text-active' : 'text-error'} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Approved Teachers" value={data.summary.qualifiedTeachers} valueClassName="text-active" />
        <SummaryCard label="Approval Rate" value={data.summary.qualificationRate} suffix="%" valueClassName="text-secondary" />
        <SummaryCard label="Ratio Compliance" value={data.summary.isCompliant ? 'Compliant' : 'Non-Compliant'} valueClassName={data.summary.isCompliant ? 'text-active' : 'text-error'} />
        <SummaryCard label="Classes w/o Teacher" value={uncovered} valueClassName={uncovered > 0 ? 'text-error' : 'text-active'} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border border-slate-300 bg-white p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Teacher Approval</p>
          <DonutChart segments={[{ label: 'Approved', value: data.summary.qualifiedTeachers, color: CHART_COLORS.active }, { label: 'Other', value: data.summary.totalTeachers - data.summary.qualifiedTeachers, color: CHART_COLORS.slate }]} />
        </div>
        <div className="border border-slate-300 bg-white p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Staff by Position</p>
          <BarListChart data={data.byPosition.map((p) => ({ label: p.position.replaceAll('_', ' '), value: p.count }))} />
        </div>
      </div>
      <ReportTable title="Teaching Coverage by Class" headers={['Class', 'Grade', 'Enrolled', 'Homeroom Teacher(s)', 'Subject Teachers', 'Coverage']}
        alignments={['left', 'left', 'right', 'left', 'right', 'center']}>
        {data.classAssignments.map((c) => (
          <tr key={c.classId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{c.className}{c.section ? ` — ${c.section}` : ''}</td>
            <td className="px-4 py-3 text-slate-500">{formatGradeLevel(c.gradeLevel)}</td>
            <td className="px-4 py-3 text-right text-slate-600">{c.enrolled.toLocaleString()}</td>
            <td className="px-4 py-3 text-slate-600">{c.homeroomTeachers || '—'}</td>
            <td className="px-4 py-3 text-right text-slate-600">{c.subjectTeacherCount}</td>
            <td className="px-4 py-3 text-center">
              <span className={`px-2 py-0.5 text-xs font-semibold ${c.hasNoTeacher ? 'bg-red-50 text-red-600' : 'bg-active text-white'}`}>{c.hasNoTeacher ? 'No Teacher' : 'Covered'}</span>
            </td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}

function FinancialView({ data, termName }: { data: FinancialReportData; termName: string }) {
  const fmt = (n: number) => formatCurrency(n, data.summary.currency);
  if (data.byFeeRule.length === 0) return <ReportEmptyState title="No fee obligations" detail={`No fee obligations exist for this scope in ${termName}.`} />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
        <SummaryCard label="Expected" value={fmt(data.summary.totalExpected)} />
        <SummaryCard label="Collected" value={fmt(data.summary.totalCollected)} valueClassName="text-active" />
        <SummaryCard label="Outstanding" value={fmt(data.summary.totalOutstanding)} valueClassName="text-error" />
        <SummaryCard label="Waived" value={fmt(data.summary.totalWaived)} valueClassName="text-secondary" />
        <SummaryCard label="Collection Rate" value={data.summary.collectionRate} suffix="%" valueClassName="text-secondary" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="border border-slate-300 bg-white p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Student Payment Status</p>
          <DonutChart segments={[
            { label: 'Paid', value: data.paymentStatus.paid, color: CHART_COLORS.active },
            { label: 'Partial', value: data.paymentStatus.partial, color: CHART_COLORS.pending },
            { label: 'Unpaid', value: data.paymentStatus.unpaid, color: CHART_COLORS.error },
          ]} />
          <p className="mt-2 text-xs text-slate-400">{data.paymentStatus.waived} waived · {data.paymentStatus.studentsWithoutObligations} without obligations</p>
        </div>
        <div className="border border-slate-300 bg-white p-5 lg:col-span-2">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Collected by Class</p>
          <BarListChart data={data.byClass.filter((c) => c.expected > 0 || c.collected > 0).map((c) => ({ label: c.section ? `${c.className} — ${c.section}` : c.className, value: c.collected }))} color={CHART_COLORS.active} />
        </div>
      </div>
      <ReportTable title="Collections by Fee Rule" headers={['Fee Rule', 'Category', 'Expected', 'Collected', 'Outstanding', 'Rate']} alignments={['left', 'left', 'right', 'right', 'right', 'right']}>
        {data.byFeeRule.map((f) => (
          <tr key={f.feeRuleId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{f.name}</td>
            <td className="px-4 py-3 text-slate-500">{f.category.replaceAll('_', ' ')}</td>
            <td className="px-4 py-3 text-right text-xs text-slate-600">{fmt(f.expected)}</td>
            <td className="px-4 py-3 text-right text-xs text-active">{fmt(f.collected)}</td>
            <td className="px-4 py-3 text-right text-xs text-error">{fmt(f.outstanding)}</td>
            <td className="px-4 py-3 text-right">
              <span className={`px-2 py-0.5 text-xs font-semibold text-white ${f.collectionRate >= 80 ? 'bg-active' : f.collectionRate >= 50 ? 'bg-pending' : 'bg-error'}`}>{f.collectionRate}%</span>
            </td>
          </tr>
        ))}
      </ReportTable>
      <ReportTable title="Collections by Class" headers={['Class', 'Students', 'Expected', 'Collected', 'Outstanding', 'Rate']} alignments={['left', 'right', 'right', 'right', 'right', 'right']}>
        {data.byClass.map((c) => (
          <tr key={c.classId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{c.className}{c.section ? ` — ${c.section}` : ''}</td>
            <td className="px-4 py-3 text-right text-slate-600">{c.studentCount}</td>
            <td className="px-4 py-3 text-right text-xs text-slate-600">{fmt(c.expected)}</td>
            <td className="px-4 py-3 text-right text-xs text-active">{fmt(c.collected)}</td>
            <td className="px-4 py-3 text-right text-xs text-error">{fmt(c.outstanding)}</td>
            <td className="px-4 py-3 text-right">
              <span className={`px-2 py-0.5 text-xs font-semibold text-white ${c.collectionRate >= 80 ? 'bg-active' : c.collectionRate >= 50 ? 'bg-pending' : 'bg-error'}`}>{c.collectionRate}%</span>
            </td>
          </tr>
        ))}
      </ReportTable>
      <div className="border border-slate-300 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Transaction Ledger ({data.transactions.length})</p>
        </div>
        <div className="max-h-96 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-slate-100 bg-slate-50">
              <tr>
                {['Date', 'Student', 'Fee Rule', 'Amount', 'Method', 'Receipt #', 'Recorded By', 'Status'].map((h, i) => (
                  <th key={h} className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400 ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.transactions.map((t) => (
                <tr key={t.id} className={`hover:bg-slate-50 ${t.isReversed ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 text-xs text-slate-600">{new Date(t.paidAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{t.studentName}</td>
                  <td className="px-4 py-3 text-slate-600">{t.feeRuleName}</td>
                  <td className={`px-4 py-3 text-right text-xs ${t.isReversed ? 'text-slate-400 line-through' : 'text-active'}`}>{fmt(t.amount)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{t.method.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{t.receiptNumber}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{t.recordedByName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${t.isReversed ? 'bg-red-50 text-red-600' : 'bg-active text-white'}`}>{t.isReversed ? 'Reversed' : 'Posted'}</span>
                  </td>
                </tr>
              ))}
              {data.transactions.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-xs text-slate-400">No payments recorded in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
