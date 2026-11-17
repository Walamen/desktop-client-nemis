'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  GraduationCap,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Spinner } from '@nemis-desktop/ui';
import type { CountyAttendancePeriod, DeoReportQuery } from '@nemis-desktop/types';
import type { DeoReportType } from '@nemis-desktop/presentation';
import { useDeoReportsViewModel } from '@/lib/presentation/hooks/deo';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { systemBridge } from '@/services/nemis-bridge/shared/system-bridge';
import type { ExportedFile, ExportOptions } from '@/lib/reports/automatedReportExport';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { AcademicReportView } from '@/components/county/reports/AcademicReportView';
import { AttendanceReportView } from '@/components/county/reports/AttendanceReportView';
import { EnrollmentReportView } from '@/components/county/reports/EnrollmentReportView';
import { StaffComplianceReportView } from '@/components/county/reports/StaffComplianceReportView';

const REPORT_TYPES: { id: DeoReportType; name: string; icon: typeof Users }[] = [
  { id: 'ENROLLMENT', name: 'Enrollment', icon: Users },
  { id: 'ATTENDANCE', name: 'Attendance', icon: Calendar },
  { id: 'ACADEMIC', name: 'Academic', icon: GraduationCap },
  { id: 'STAFF_COMPLIANCE', name: 'Staff & Compliance', icon: ClipboardCheck },
];

const PERIODS: { id: CountyAttendancePeriod; label: string }[] = [
  { id: 'DAILY', label: 'Last 7 Days' },
  { id: 'WEEKLY', label: 'Last 4 Weeks' },
  { id: 'MONTHLY', label: 'Last 3 Months' },
];

type ExportFormat = 'pdf' | 'excel' | 'word';
type ExportState = { kind: 'idle' } | { kind: 'exporting' } | { kind: 'saved'; path: string } | { kind: 'failed' };

const isReady = <T,>(state: { status: string; data?: T }): state is { status: 'success' | 'refreshing'; data: T } =>
  state.status === 'success' || state.status === 'refreshing';

const SELECT_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded-2xl bg-white text-sm focus:ring-2 focus:ring-secondary focus:border-transparent outline-none';

/** DEO Automated Reports, ported from portal-web
 * app/government/deo/reports/automated/page.tsx and generated on this device.
 * The report bodies are the County views (same rules, one district).
 * Rules: docs/superpowers/specs/2026-11-17-deo-generate-reports-design.md. */
export function DeoGenerateReportsPage() {
  const [selectedReport, setSelectedReport] = useState<DeoReportType>('ENROLLMENT');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [period, setPeriod] = useState<CountyAttendancePeriod>('WEEKLY');
  const [showFilters, setShowFilters] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ kind: 'idle' });

  const vm = useDeoReportsViewModel();
  const scopeState = useViewModel(vm.store, (s) => s.scope);
  const enrollmentState = useViewModel(vm.store, (s) => s.enrollment);
  const attendanceState = useViewModel(vm.store, (s) => s.attendance);
  const academicState = useViewModel(vm.store, (s) => s.academic);
  const staffState = useViewModel(vm.store, (s) => s.staff);
  const currentUser = useCurrentUserViewModel();
  const userState = useViewModel(currentUser.store, (s) => s.user);

  const scope = isReady(scopeState) ? scopeState.data : null;
  const hasDistrict = !!scope?.districtId;

  const loadReport = () => {
    if (!hasDistrict) return;
    const query: DeoReportQuery = selectedSchoolId ? { schoolId: selectedSchoolId } : {};
    void vm.loadReport(selectedReport, query, period);
  };

  useRevalidateOnSync(() => {
    void vm.loadScope();
  }, [vm]);
  // Each report loads only while it is the chosen one, as the web skips its queries.
  useRevalidateOnSync(loadReport, [hasDistrict, selectedReport, selectedSchoolId, period]);

  const reportState =
    selectedReport === 'ATTENDANCE'
      ? attendanceState
      : selectedReport === 'ACADEMIC'
        ? academicState
        : selectedReport === 'STAFF_COMPLIANCE'
          ? staffState
          : enrollmentState;
  const reportData =
    reportState.status === 'success' || reportState.status === 'refreshing' ? reportState.data : undefined;
  const isLoading = reportState.status === 'idle' || reportState.status === 'loading';
  const isRefreshing = isLoading || reportState.status === 'refreshing';
  const isExporting = exportState.kind === 'exporting';
  const reportName = REPORT_TYPES.find((type) => type.id === selectedReport)?.name;

  /** Builds the letterhead file in the renderer, then saves it through the app. */
  const handleExport = async (format: ExportFormat) => {
    if (!reportData) return;
    setExportState({ kind: 'exporting' });
    try {
      const exports = await import('@/lib/reports/automatedReportExport');
      const user = isReady(userState) ? userState.data : null;
      const options: ExportOptions = {
        countyName: scope?.county?.name,
        countyCode: scope?.county?.code ?? undefined,
        generatedBy: user?.fullName || user?.email || 'District Education Officer',
        countyWide: false,
      };
      const file: ExportedFile =
        format === 'pdf'
          ? await exports.exportToPDF(reportData, options)
          : format === 'excel'
            ? exports.exportToExcel(reportData, options)
            : await exports.exportToWord(reportData, options);
      const result = await systemBridge.saveFile(file);
      // A cancelled save dialog says nothing.
      setExportState(result.saved ? { kind: 'saved', path: result.path } : { kind: 'idle' });
    } catch {
      setExportState({ kind: 'failed' });
    }
  };

  if (scope && !scope.districtId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" aria-hidden />
          <p className="text-gray-600">No district assigned to your account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
          <h1 className="text-xl font-bold text-white">Automated Reports</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors"
          >
            <Building2 className="w-4 h-4" aria-hidden />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          <button
            type="button"
            onClick={loadReport}
            disabled={isRefreshing || !hasDistrict}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing && hasDistrict ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        {showFilters ? (
          <div className="bg-white border border-gray-300 rounded-2xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="deo-report-school" className="block text-sm font-medium text-gray-700 mb-1">
                  School Filter
                </label>
                <select
                  id="deo-report-school"
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">All Schools</option>
                  {(scope?.schools ?? []).map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedReport === 'ATTENDANCE' ? (
                <div>
                  <label htmlFor="deo-report-period" className="block text-sm font-medium text-gray-700 mb-1">
                    Time Period
                  </label>
                  <select
                    id="deo-report-period"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as CountyAttendancePeriod)}
                    className={SELECT_CLASS}
                  >
                    {PERIODS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {REPORT_TYPES.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedReport === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setSelectedReport(type.id)}
                aria-pressed={isSelected}
                className={`p-4 rounded-2xl border text-left transition-colors ${
                  isSelected ? 'border-secondary border-2 bg-sky-50' : 'border-slate-300 bg-white hover:border-gray-400'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-white" aria-hidden />
                </div>
                <h3 className={`font-semibold ${isSelected ? 'text-secondary' : 'text-gray-700'}`}>{type.name}</h3>
                <p className="text-xs text-gray-500 mt-1">Report</p>
              </button>
            );
          })}
        </div>

        <div className="bg-white border border-gray-300 rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="w-5 h-5 text-gray-500" aria-hidden />
              <span className="font-medium text-gray-700">{reportName} Report</span>
              {reportData ? (
                <span className="text-sm text-gray-500">• Generated {new Date(reportData.generatedAt).toLocaleString()}</span>
              ) : null}
              {exportState.kind === 'exporting' ? (
                <span className="flex items-center gap-2 text-xs text-secondary font-medium">
                  <Spinner size="sm" /> Preparing export with official letterhead…
                </span>
              ) : null}
              {exportState.kind === 'saved' ? (
                <span className="text-xs font-medium text-active break-all">Saved to {exportState.path}</span>
              ) : null}
              {exportState.kind === 'failed' ? (
                <span className="text-xs font-medium text-error">Export failed. Please try again.</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 mr-2">Export as:</span>
              {(
                [
                  { format: 'pdf', label: 'PDF', Icon: Download },
                  { format: 'excel', label: 'Excel', Icon: FileSpreadsheet },
                  { format: 'word', label: 'Word', Icon: FileType },
                ] as const
              ).map(({ format, label, Icon }) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => void handleExport(format)}
                  disabled={!reportData || isLoading || isExporting}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {reportState.status === 'error' ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500" aria-hidden />
              <div>
                <h3 className="font-medium text-red-800">Failed to load report</h3>
                <p className="text-sm text-red-600">Please try again or contact support.</p>
                <button type="button" onClick={loadReport} className="mt-1 text-sm underline text-red-700">
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
            <span className="ml-3 text-gray-600">Generating report...</span>
          </div>
        ) : reportData ? (
          <div className="space-y-5">
            {reportData.reportType === 'ENROLLMENT' ? <EnrollmentReportView data={reportData} isCountyWide={false} /> : null}
            {reportData.reportType === 'ATTENDANCE' ? <AttendanceReportView data={reportData} isCountyWide={false} /> : null}
            {reportData.reportType === 'ACADEMIC' ? <AcademicReportView data={reportData} isCountyWide={false} /> : null}
            {reportData.reportType === 'STAFF_COMPLIANCE' ? (
              <StaffComplianceReportView data={reportData} isCountyWide={false} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
