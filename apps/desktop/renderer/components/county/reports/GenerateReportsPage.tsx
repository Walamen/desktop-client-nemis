"use client";

import { useState } from "react";
import { Spinner } from "@nemis-desktop/ui";
import type { CountyAttendancePeriod, CountyEnrollmentReportQuery } from "@nemis-desktop/types";
import {
  AlertTriangle,
  Calendar,
  ClipboardCheck,
  DollarSign,
  FileText,
  GraduationCap,
  MapPin,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { useCountyReportsViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { AcademicReportView } from "./AcademicReportView";
import { AttendanceReportView } from "./AttendanceReportView";
import { EnrollmentReportView } from "./EnrollmentReportView";
import { StaffComplianceReportView } from "./StaffComplianceReportView";
import { FinancialReportSection } from "./FinancialReportSection";

type ReportType = "ENROLLMENT" | "ATTENDANCE" | "ACADEMIC" | "STAFF_COMPLIANCE" | "FINANCIAL";

const reportTypes = [
  { id: "ENROLLMENT" as ReportType, name: "Enrollment", icon: Users, desc: "Student enrollment statistics" },
  { id: "ATTENDANCE" as ReportType, name: "Attendance", icon: Calendar, desc: "Attendance rates and trends" },
  { id: "ACADEMIC" as ReportType, name: "Academic", icon: GraduationCap, desc: "Academic performance data" },
  {
    id: "STAFF_COMPLIANCE" as ReportType,
    name: "Staff & Compliance",
    icon: ClipboardCheck,
    desc: "Staff qualifications and compliance",
  },
  { id: "FINANCIAL" as ReportType, name: "Financial", icon: DollarSign, desc: "Fee collection and revenue report" },
];

const periodLabels: Record<CountyAttendancePeriod, string> = {
  DAILY: "Last 7 Days",
  WEEKLY: "Last 4 Weeks",
  MONTHLY: "Last 3 Months",
};

const isReady = <T,>(state: { status: string; data?: T }): state is { status: "success" | "refreshing"; data: T } =>
  state.status === "success" || state.status === "refreshing";

/** Port of portal-web government/county/reports/generate/page.tsx, read from
 * this device. */
export function GenerateReportsPage() {
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>("ALL");
  const [selectedReport, setSelectedReport] = useState<ReportType>("ENROLLMENT");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [attendancePeriod, setAttendancePeriod] = useState<CountyAttendancePeriod>("WEEKLY");

  const vm = useCountyReportsViewModel();
  const optionsState = useViewModel(vm.store, (s) => s.options);
  const schoolsState = useViewModel(vm.store, (s) => s.schools);
  const enrollmentState = useViewModel(vm.store, (s) => s.enrollment);
  const attendanceState = useViewModel(vm.store, (s) => s.attendance);
  const academicState = useViewModel(vm.store, (s) => s.academic);
  const staffState = useViewModel(vm.store, (s) => s.staff);
  const financeDashboardState = useViewModel(vm.store, (s) => s.financeDashboard);
  const financeSchoolsState = useViewModel(vm.store, (s) => s.financeSchools);
  const financeLoadedAt = useViewModel(vm.store, (s) => s.financeLoadedAt);

  const isAllDistricts = selectedDistrictId === "ALL";
  const singleDistrictId = selectedDistrictId && !isAllDistricts ? selectedDistrictId : "";

  const scopeQuery = (): CountyEnrollmentReportQuery => {
    const query: CountyEnrollmentReportQuery = {};
    if (singleDistrictId) query.districtId = singleDistrictId;
    if (singleDistrictId && selectedSchoolId) query.schoolId = selectedSchoolId;
    return query;
  };

  useRevalidateOnSync(() => {
    void vm.loadOptions();
  }, []);
  useRevalidateOnSync(() => {
    void vm.loadSchools(singleDistrictId);
  }, [singleDistrictId]);
  /** The chosen district-scoped report; Financial loads on its own. */
  const loadReport = () => {
    if (selectedReport === "FINANCIAL" || !selectedDistrictId) return;
    const query = scopeQuery();
    if (selectedReport === "ENROLLMENT") void vm.loadEnrollment(query);
    else if (selectedReport === "ATTENDANCE") void vm.loadAttendance({ ...query, period: attendancePeriod });
    else if (selectedReport === "ACADEMIC") void vm.loadAcademic(query);
    else void vm.loadStaff(query);
  };

  // Each report loads only while it is the chosen one, as the web skips its queries.
  useRevalidateOnSync(loadReport, [selectedReport, selectedDistrictId, selectedSchoolId, attendancePeriod]);
  useRevalidateOnSync(() => {
    if (selectedReport === "FINANCIAL") void vm.loadFinance();
  }, [selectedReport]);

  const county = isReady(optionsState) ? optionsState.data.county : null;
  const districts = isReady(optionsState) ? optionsState.data.districts : [];
  const schools = isReady(schoolsState) ? schoolsState.data : [];
  const reportState =
    selectedReport === "ATTENDANCE"
      ? attendanceState
      : selectedReport === "ACADEMIC"
        ? academicState
        : selectedReport === "STAFF_COMPLIANCE"
          ? staffState
          : enrollmentState;
  const reportData =
    reportState.status === "success" || reportState.status === "refreshing" ? reportState.data : undefined;
  const isLoading = reportState.status === "idle" || reportState.status === "loading";
  const isDistrictScoped = selectedReport !== "FINANCIAL";
  const financeLoading =
    financeDashboardState.status === "idle" ||
    financeDashboardState.status === "loading" ||
    financeSchoolsState.status === "idle" ||
    financeSchoolsState.status === "loading";

  const handleRefresh = () => {
    if (selectedReport === "FINANCIAL") void vm.loadFinance();
    else loadReport();
  };

  const selectedDistrictName = isAllDistricts
    ? "All Districts"
    : districts.find((d) => d.id === selectedDistrictId)?.name;
  // When the shown report was produced: the report's stamp, or for Financial
  // the time its figures arrived.
  const reportTime = selectedReport === "FINANCIAL" ? financeLoadedAt : reportData?.generatedAt;
  const reportName = reportTypes.find((t) => t.id === selectedReport)?.name;

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      {/* Header Band */}
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">{county?.name || "County"}</p>
          <h1 className="text-xl font-bold text-white">Generate Reports</h1>
        </div>
        {county?.code && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-widest">
            <MapPin className="w-3.5 h-3.5" />
            {county.code}
          </div>
        )}
      </div>

      <div className="py-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Filter Sidebar */}
          <div className="w-full lg:w-56 shrink-0">
            <div className="sticky top-6 bg-white border border-slate-300 p-5 space-y-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Search className="w-3.5 h-3.5" /> Filters
              </p>

              {/* Report Type */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Report Type
                </label>
                <div className="space-y-1">
                  {reportTypes.map((type) => {
                    const Icon = type.icon;
                    const isSelected = selectedReport === type.id;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setSelectedReport(type.id)}
                        className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm transition-colors ${
                          isSelected ? "bg-secondary text-white font-medium" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {type.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* District — hidden for Financial (always county-wide) */}
              {selectedReport !== "FINANCIAL" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    District <span className="text-error">*</span>
                  </label>
                  <select
                    value={selectedDistrictId}
                    onChange={(e) => {
                      setSelectedDistrictId(e.target.value);
                      setSelectedSchoolId("");
                    }}
                    className="w-full px-3 py-2 border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-1 focus:ring-secondary"
                  >
                    <option value="">— Choose district —</option>
                    <option value="ALL">All Districts</option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* School filter */}
              {selectedReport !== "FINANCIAL" && singleDistrictId && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">School</label>
                  <select
                    value={selectedSchoolId}
                    onChange={(e) => setSelectedSchoolId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:ring-1 focus:ring-secondary"
                  >
                    <option value="">All Schools</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Period (Attendance only) */}
              {selectedReport === "ATTENDANCE" && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Time Period
                  </label>
                  <div className="space-y-1">
                    {(["DAILY", "WEEKLY", "MONTHLY"] as CountyAttendancePeriod[]).map((period) => (
                      <button
                        key={period}
                        onClick={() => setAttendancePeriod(period)}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                          attendancePeriod === period ? "bg-secondary text-white font-medium" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {periodLabels[period]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Refresh */}
              <button
                onClick={handleRefresh}
                disabled={
                  (selectedReport === "FINANCIAL" ? financeLoading : isLoading && !!selectedDistrictId) ||
                  (isDistrictScoped && !selectedDistrictId)
                }
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    (selectedReport === "FINANCIAL" ? financeLoading : isLoading && !!selectedDistrictId) ? "animate-spin" : ""
                  }`}
                />
                Refresh
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Report meta toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white border border-slate-300 px-5 py-4">
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-700">{reportName} Report</span>
                {selectedReport !== "FINANCIAL" && selectedDistrictName && (
                  <span className="text-sm text-slate-400">— {selectedDistrictName}</span>
                )}
                {reportTime && (
                  <span className="text-xs text-slate-400">&middot; {new Date(reportTime).toLocaleString()}</span>
                )}
              </div>
            </div>

            {/* Financial report — county-wide, no district filter needed */}
            {selectedReport === "FINANCIAL" &&
              (financeDashboardState.status === "error" || financeSchoolsState.status === "error" ? (
                <div className="bg-red-50 border border-red-100 px-5 py-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Failed to load financial report</p>
                    <p className="text-xs text-red-500 mt-0.5">Please try refreshing.</p>
                  </div>
                </div>
              ) : isReady(financeDashboardState) && isReady(financeSchoolsState) ? (
                <FinancialReportSection dashboard={financeDashboardState.data} schools={financeSchoolsState.data} />
              ) : (
                <div className="bg-white border border-slate-300 py-12 flex items-center justify-center gap-3">
                  <Spinner size="lg" />
                  <span className="text-sm text-slate-500">Generating financial report…</span>
                </div>
              ))}

            {/* Empty prompt — only for district-scoped reports */}
            {isDistrictScoped && !selectedDistrictId && (
              <div className="bg-white border border-slate-300 p-12 text-center">
                <MapPin className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-500 mb-1">Select a District</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Choose a district to generate reports — enrollment, attendance, academic performance, and staff
                  compliance.
                </p>
              </div>
            )}

            {/* Loading */}
            {isDistrictScoped && selectedDistrictId && isLoading && (
              <div className="bg-white rounded-lg border border-slate-300 py-12 flex items-center justify-center gap-3">
                <Spinner size="lg" />
                <span className="text-sm text-slate-500">Generating {reportName?.toLowerCase()} report…</span>
              </div>
            )}

            {/* Error */}
            {isDistrictScoped && selectedDistrictId && reportState.status === "error" && (
              <div className="bg-red-50 border border-red-100 px-5 py-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Failed to load report</p>
                  <p className="text-xs text-red-500 mt-0.5">Please try refreshing or selecting a different district.</p>
                </div>
              </div>
            )}

            {/* Report content */}
            {isDistrictScoped && selectedDistrictId && reportData && !isLoading && (
              <div className="space-y-5">
                {reportData.reportType === "ENROLLMENT" && (
                  <EnrollmentReportView data={reportData} isCountyWide={isAllDistricts} />
                )}
                {reportData.reportType === "ATTENDANCE" && (
                  <AttendanceReportView data={reportData} isCountyWide={isAllDistricts} />
                )}
                {reportData.reportType === "ACADEMIC" && (
                  <AcademicReportView data={reportData} isCountyWide={isAllDistricts} />
                )}
                {reportData.reportType === "STAFF_COMPLIANCE" && (
                  <StaffComplianceReportView data={reportData} isCountyWide={isAllDistricts} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
