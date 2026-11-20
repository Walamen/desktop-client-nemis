"use client";

import { useCallback, useMemo } from "react";
import {
  AlertTriangle,
  BarChart3,
  Users,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  CheckCircle,
  Info,
  ShieldAlert,
  Lightbulb,
  GraduationCap,
  ArrowUpDown,
} from "lucide-react";
import {
  analyticsInputFromDashboard,
  analyticsKpis,
  analyticsInsights,
  enrollmentBySchool,
  attendanceBySchool,
  teacherAnalytics,
  schoolComparison,
  type AnalyticsSchool,
} from "@nemis-desktop/presentation";
import { useDeoDashboardViewModel } from "@/lib/presentation/hooks/deo";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import EnrollmentTrendChart from "./charts/EnrollmentTrendChart";
import AttendanceTrendChart from "./charts/AttendanceTrendChart";
import GenderDistributionChart from "./charts/GenderDistributionChart";
import EnrollmentBySchoolChart from "./charts/EnrollmentBySchoolChart";
import AttendanceComparisonChart from "./charts/AttendanceComparisonChart";
import SchoolComparisonChart from "./charts/SchoolComparisonChart";

// ─── Skeleton helpers ─────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-3 w-24 bg-gray-200 rounded" />
          <div className="h-7 w-20 bg-gray-200 rounded" />
          <div className="h-3 w-32 bg-gray-100 rounded" />
        </div>
        <div className="w-11 h-11 bg-gray-100 rounded-lg" />
      </div>
    </div>
  );
}

function ChartSkeleton({ height = "h-[350px]" }: { height?: string }) {
  return (
    <div className={`${height} flex items-center justify-center animate-pulse`}>
      <div className="h-4/5 w-full bg-gray-50 rounded-lg" />
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subtitle,
  trend,
  trendLabel,
  colorClass,
  icon,
}: {
  label: string;
  value: string;
  subtitle: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  colorClass: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
            {label}
          </p>
          <p className={`text-2xl font-bold ${colorClass} mb-1 truncate`}>
            {value}
          </p>
          <div className="flex items-center gap-1.5">
            {trend === "up" && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600">
                <TrendingUp className="w-3 h-3" />
                {trendLabel}
              </span>
            )}
            {trend === "down" && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
                <TrendingDown className="w-3 h-3" />
                {trendLabel}
              </span>
            )}
            <span className="text-xs text-gray-500 truncate">{subtitle}</span>
          </div>
        </div>
        <div className="ml-3 flex-shrink-0">{icon}</div>
      </div>
    </div>
  );
}

// ─── Insight type → icon/color mapping ────────────────────────────────

const INSIGHT_STYLES = {
  success: {
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
    icon: (
      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
    ),
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    icon: (
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
    ),
  },
  danger: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />,
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    icon: <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />,
  },
} as const;

// ─── Main Page ────────────────────────────────────────────────────────

/** The DEO analytics page, ported from portal-web
 * app/government/deo/analytics/page.tsx. Every figure is computed on this
 * device from the dashboard read model through the shared analytics rules. */
export function DeoAnalyticsPage() {
  const dashboard = useDeoDashboardViewModel();
  const summary = useViewModel(dashboard.store, (s) => s.summary);

  useRevalidateOnSync(() => {
    void dashboard.loadDashboard();
  }, [dashboard]);

  const data =
    summary.status === "success" || summary.status === "refreshing"
      ? summary.data
      : null;
  const loading = summary.status === "idle" || summary.status === "loading";

  const handleRefreshAll = useCallback(() => {
    void dashboard.loadDashboard();
  }, [dashboard]);

  const place = [data?.district?.name, data?.county?.name]
    .filter(Boolean)
    .join(" · ");
  const chartData = data?.chartData;

  const input = useMemo(
    () =>
      data && data.districtId !== null ? analyticsInputFromDashboard(data) : null,
    [data],
  );
  const kpis = useMemo(() => (input ? analyticsKpis(input) : null), [input]);
  const insights = useMemo(
    () => (input ? analyticsInsights(input) : []),
    [input],
  );
  const schools = useMemo<AnalyticsSchool[]>(() => input?.schools ?? [], [input]);

  const enrollmentRows = useMemo(
    () =>
      enrollmentBySchool(schools).map((r) => ({
        name: r.name,
        enrollment: r.students,
      })),
    [schools],
  );
  const attendanceComparison = useMemo(
    () => attendanceBySchool(schools),
    [schools],
  );
  const attendanceRows = useMemo(
    () =>
      attendanceComparison.rows.map((r) => ({
        name: r.name,
        attendanceRate: r.rate,
      })),
    [attendanceComparison],
  );
  // A month with no records (rate 0) is drawn as a gap, never as 0%.
  const attendanceTrendData = useMemo(
    () =>
      (chartData?.attendanceTrend ?? []).map((p) => ({
        period: p.period,
        rate: p.rate > 0 ? p.rate : null,
      })),
    [chartData],
  );
  const teacherStats = useMemo(() => teacherAnalytics(schools), [schools]);
  const schoolComparisonData = useMemo(
    () =>
      schoolComparison(schools).map((r) => ({
        name: r.name,
        enrollment: r.students,
        attendanceRate: r.attendanceRate,
        teachersCount: r.teachers,
      })),
    [schools],
  );

  // ── No district guard ──
  if (data && data.districtId === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <p className="text-gray-600">No district assigned to your account.</p>
          <p className="text-sm text-gray-400 mt-1">
            Contact an administrator to be assigned to a district.
          </p>
        </div>
      </div>
    );
  }

  const hasError = summary.status === "error" && !input;

  const attendanceRate = kpis?.attendanceRate ?? null;
  const attendanceTone =
    attendanceRate === null
      ? { text: "text-gray-500", bg: "bg-gray-50", icon: "text-gray-400" }
      : attendanceRate >= 85
        ? { text: "text-green-700", bg: "bg-green-50", icon: "text-green-600" }
        : attendanceRate >= 75
          ? {
              text: "text-amber-700",
              bg: "bg-amber-50",
              icon: "text-amber-600",
            }
          : { text: "text-red-700", bg: "bg-red-50", icon: "text-red-600" };

  const direction = (n: number | null): "up" | "down" | "neutral" =>
    n === null || n === 0 ? "neutral" : n > 0 ? "up" : "down";
  const signed = (n: number | null, unit: string) =>
    n === null || n === 0 ? "" : n > 0 ? `+${n}${unit}` : `${n}${unit}`;

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            DEO Portal
          </p>
          <h1 className="text-xl font-bold text-white">Analytics Dashboard</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {place ? (
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-widest">
                District
              </p>
              <p className="text-sm font-semibold text-slate-200 mt-0.5">
                {place}
              </p>
            </div>
          ) : null}
          <button
            onClick={handleRefreshAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>
      <div className="px-6 py-6 space-y-5">
        {hasError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-600 text-sm">Failed to load analytics.</p>
            <button
              onClick={handleRefreshAll}
              className="text-red-700 underline text-sm mt-1"
            >
              Retry
            </button>
          </div>
        )}

        {/* SECTION 2 — KPI SUMMARY ROW */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Total Enrollment"
              value={kpis.totalStudents.toLocaleString()}
              subtitle="Active students"
              trend={direction(kpis.enrollmentChangePct)}
              trendLabel={signed(kpis.enrollmentChangePct, "%")}
              colorClass="text-gray-900"
              icon={
                <div className="w-11 h-11 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
              }
            />
            <KpiCard
              label="Avg Attendance"
              value={attendanceRate === null ? "No data" : `${attendanceRate}%`}
              subtitle={
                attendanceRate === null
                  ? "No records in the last 6 months"
                  : "Latest month with records"
              }
              trend={direction(kpis.attendanceChange)}
              trendLabel={signed(kpis.attendanceChange, "pt")}
              colorClass={attendanceTone.text}
              icon={
                <div
                  className={`w-11 h-11 rounded-lg flex items-center justify-center ${attendanceTone.bg}`}
                >
                  <BarChart3 className={`w-5 h-5 ${attendanceTone.icon}`} />
                </div>
              }
            />
            <KpiCard
              label="Gender Ratio"
              value={
                kpis.malePct === null
                  ? "No data"
                  : `${kpis.malePct}:${kpis.femalePct}`
              }
              subtitle={
                kpis.malePct === null
                  ? "No student data"
                  : `${kpis.malePct}% male / ${kpis.femalePct}% female`
              }
              colorClass={
                kpis.malePct === null ? "text-gray-500" : "text-gray-900"
              }
              icon={
                <div className="w-11 h-11 bg-purple-50 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
              }
            />
            <KpiCard
              label="Schools Performing Well"
              value={String(kpis.schoolsGood)}
              subtitle="Attendance ≥ 80%"
              colorClass="text-green-700"
              icon={
                <div className="w-11 h-11 bg-green-50 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
              }
            />
            <KpiCard
              label="Warning + Critical"
              value={String(kpis.schoolsWarningOrCritical)}
              subtitle={
                kpis.schoolsNoData > 0 ? `No data: ${kpis.schoolsNoData}` : ""
              }
              colorClass={
                kpis.schoolsWarningOrCritical > 0
                  ? "text-red-700"
                  : "text-gray-900"
              }
              icon={
                <div
                  className={`w-11 h-11 rounded-lg flex items-center justify-center ${
                    kpis.schoolsWarningOrCritical > 0
                      ? "bg-red-50"
                      : "bg-gray-50"
                  }`}
                >
                  <AlertTriangle
                    className={`w-5 h-5 ${
                      kpis.schoolsWarningOrCritical > 0
                        ? "text-red-600"
                        : "text-gray-400"
                    }`}
                  />
                </div>
              }
            />
          </div>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3 — ENROLLMENT ANALYTICS
          ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Enrollment Trend (6 Months)
            </h3>
            {loading ? (
              <ChartSkeleton />
            ) : chartData?.enrollmentTrend &&
              chartData.enrollmentTrend.length > 0 ? (
              <EnrollmentTrendChart data={chartData.enrollmentTrend} />
            ) : (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">
                    No enrollment trend data
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Top 10 Schools by Enrollment
            </h3>
            {loading ? (
              <ChartSkeleton />
            ) : enrollmentRows.length > 0 ? (
              <EnrollmentBySchoolChart data={enrollmentRows} />
            ) : (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">
                    No school enrollment data available
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
          SECTION 4 — ATTENDANCE ANALYTICS
          ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Attendance Rate Trend (6 Months)
            </h3>
            {loading ? (
              <ChartSkeleton />
            ) : chartData?.attendanceTrend &&
              chartData.attendanceTrend.length > 0 ? (
              <AttendanceTrendChart data={attendanceTrendData} />
            ) : (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No attendance data</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              School Attendance Comparison
            </h3>
            {loading ? (
              <ChartSkeleton />
            ) : attendanceRows.length > 0 ? (
              <>
                <AttendanceComparisonChart data={attendanceRows} />
                {attendanceComparison.withoutData > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    {attendanceComparison.withoutData}{" "}
                    {attendanceComparison.withoutData === 1 ? "school" : "schools"}{" "}
                    without attendance data
                  </p>
                )}
              </>
            ) : (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">
                    No school attendance data available
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5 — GENDER DISTRIBUTION
          ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                Gender Distribution
              </h3>
              {loading ? (
                <div className="h-[300px] flex items-center justify-center animate-pulse">
                  <div className="h-48 w-48 bg-gray-100 rounded-full" />
                </div>
              ) : chartData?.genderDistribution ? (
                <GenderDistributionChart data={chartData.genderDistribution} />
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No gender data</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Gender breakdown details */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                Gender Breakdown
              </h3>
              {loading ? (
                <div className="space-y-4 animate-pulse">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-14 bg-gray-100 rounded-lg" />
                  ))}
                </div>
              ) : chartData?.genderDistribution ? (
                <div className="space-y-4">
                  {(() => {
                    const { male, female } = chartData.genderDistribution;
                    const total = male + female;
                    if (total === 0) {
                      return (
                        <p className="text-sm text-gray-500 text-center py-8">
                          No student data available.
                        </p>
                      );
                    }
                    const malePct = kpis?.malePct ?? 0;
                    const femalePct = kpis?.femalePct ?? 0;

                    return (
                      <>
                        {/* Male bar */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-gray-700">
                              Male
                            </span>
                            <span className="text-sm text-gray-600">
                              {male.toLocaleString()} ({malePct}%)
                            </span>
                          </div>
                          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-500"
                              style={{ width: `${malePct}%` }}
                            />
                          </div>
                        </div>
                        {/* Female bar */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-gray-700">
                              Female
                            </span>
                            <span className="text-sm text-gray-600">
                              {female.toLocaleString()} ({femalePct}%)
                            </span>
                          </div>
                          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all duration-500"
                              style={{ width: `${femalePct}%` }}
                            />
                          </div>
                        </div>
                        {/* Total */}
                        <div className="pt-3 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              Total Students
                            </span>
                            <span className="text-lg font-bold text-gray-900">
                              {total.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* SECTION 6 — PERFORMANCE INSIGHTS PANEL */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            Performance Insights
          </h3>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <p className="text-xs text-gray-500">
              Auto-generated insights based on current district data
            </p>
          </div>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-50 rounded-lg" />
              ))}
            </div>
          ) : insights.length > 0 ? (
            <div className="space-y-2.5">
              {insights.map((insight) => {
                const style = INSIGHT_STYLES[insight.type];
                return (
                  <div
                    key={insight.id}
                    className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border ${style.bg} ${style.border}`}
                  >
                    {style.icon}
                    <p className={`text-sm leading-relaxed ${style.text}`}>
                      {insight.text}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* SECTION 7 — TEACHER ANALYTICS */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            Teacher Analytics
          </h3>
          <div className="flex items-center gap-2 mb-5">
            <GraduationCap className="w-4 h-4 text-violet-500" />
            <p className="text-xs text-gray-500">
              Distribution of teachers across district schools
            </p>
          </div>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded-lg" />
                ))}
              </div>
              <div className="h-48 bg-gray-100 rounded-lg" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-violet-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-violet-700">
                    {teacherStats.total.toLocaleString()}
                  </p>
                  <p className="text-xs text-violet-600 font-medium mt-1">
                    Total Teachers
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {teacherStats.schoolsWithTeachers.toLocaleString()}
                  </p>
                  <p className="text-xs text-green-600 font-medium mt-1">
                    Schools with Teachers
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">
                    {teacherStats.avgPerSchool}
                  </p>
                  <p className="text-xs text-blue-600 font-medium mt-1">
                    Avg per School
                  </p>
                </div>
              </div>

              {teacherStats.bySchool.length > 0 ? (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Top Schools by Teacher Count
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                            School
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                            Teachers
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase w-1/3">
                            Distribution
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {teacherStats.bySchool.map((row) => {
                          const pct =
                            teacherStats.total > 0
                              ? Math.round(
                                  (row.teachers / teacherStats.total) * 100,
                                )
                              : 0;
                          return (
                            <tr key={row.schoolId} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-sm text-gray-900">
                                {row.name}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-gray-700 text-right font-medium">
                                {row.teachers}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-violet-500 h-2 rounded-full"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500 w-10 text-right">
                                    {pct}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <GraduationCap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    No teacher distribution data available.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 8 — SCHOOL COMPARISON */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-1">
            School Comparison
          </h3>
          <div className="flex items-center gap-2 mb-5">
            <ArrowUpDown className="w-4 h-4 text-indigo-500" />
            <p className="text-xs text-gray-500">
              Compare schools across enrollment, attendance, and staffing
              metrics
            </p>
          </div>
          {loading ? (
            <div className="h-[400px] flex items-center justify-center animate-pulse">
              <div className="h-full w-full bg-gray-100 rounded-lg" />
            </div>
          ) : (
            <SchoolComparisonChart data={schoolComparisonData} />
          )}
        </div>
      </div>
    </div>
  );
}
