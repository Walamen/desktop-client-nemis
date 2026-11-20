import type { DeoDashboardResult } from "@nemis-desktop/types";

/**
 * DEO Analytics rules. Pure and dependency-free: mirrored verbatim on the
 * Electron desktop. A monthly attendance rate of 0 means "no records that
 * month", never a real 0%.
 */

export interface AnalyticsSchool {
  id: string;
  name: string;
  students: number;
  teachers: number;
  attendanceRate: number | null;
  performanceStatus: string;
}

export interface AnalyticsInput {
  totalStudents: number;
  chartData: {
    enrollmentTrend: { period: string; enrollment: number }[];
    attendanceTrend: { period: string; rate: number }[];
    genderDistribution: { male: number; female: number };
  };
  schools: AnalyticsSchool[];
  openAlerts: number;
}

export interface AnalyticsKpis {
  totalStudents: number;
  enrollmentChangePct: number | null;
  attendanceRate: number | null;
  attendanceChange: number | null;
  malePct: number | null;
  femalePct: number | null;
  schoolsGood: number;
  schoolsWarningOrCritical: number;
  schoolsNoData: number;
}

export interface AnalyticsInsight {
  id: string;
  text: string;
  type: "success" | "warning" | "danger" | "info";
}

/** Latest month with records (rate > 0) and, if the month right before it also has records, that one. */
function latestAttendance(input: AnalyticsInput): {
  latest: { period: string; rate: number } | null;
  previous: { period: string; rate: number } | null;
} {
  const trend = input.chartData.attendanceTrend;
  for (let i = trend.length - 1; i >= 0; i--) {
    const point = trend[i];
    if (point && point.rate > 0) {
      const before = i > 0 ? trend[i - 1] : undefined;
      return {
        latest: point,
        previous: before && before.rate > 0 ? before : null,
      };
    }
  }
  return { latest: null, previous: null };
}

function enrollmentPoints(input: AnalyticsInput): {
  latest: { period: string; enrollment: number };
  previous: { period: string; enrollment: number };
} | null {
  const trend = input.chartData.enrollmentTrend;
  const latest = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  if (!latest || !previous) return null;
  return { latest, previous };
}

function genderPcts(input: AnalyticsInput): {
  malePct: number | null;
  femalePct: number | null;
} {
  const { male, female } = input.chartData.genderDistribution;
  const total = male + female;
  if (total <= 0) return { malePct: null, femalePct: null };
  const malePct = Math.round((male / total) * 100);
  return { malePct, femalePct: 100 - malePct };
}

function countStatus(schools: AnalyticsSchool[], status: string): number {
  return schools.filter((s) => s.performanceStatus === status).length;
}

export function analyticsKpis(input: AnalyticsInput): AnalyticsKpis {
  const points = enrollmentPoints(input);
  const enrollmentChangePct =
    points && points.previous.enrollment !== 0
      ? Math.round(
          ((points.latest.enrollment - points.previous.enrollment) /
            points.previous.enrollment) *
            100,
        )
      : null;

  const { latest, previous } = latestAttendance(input);
  const { malePct, femalePct } = genderPcts(input);

  return {
    totalStudents: input.totalStudents,
    enrollmentChangePct,
    attendanceRate: latest ? latest.rate : null,
    attendanceChange: latest && previous ? latest.rate - previous.rate : null,
    malePct,
    femalePct,
    schoolsGood: countStatus(input.schools, "Good"),
    schoolsWarningOrCritical:
      countStatus(input.schools, "Warning") +
      countStatus(input.schools, "Critical"),
    schoolsNoData: countStatus(input.schools, "No Data"),
  };
}

export function analyticsInsights(input: AnalyticsInput): AnalyticsInsight[] {
  const out: Omit<AnalyticsInsight, "id">[] = [];
  const kpis = analyticsKpis(input);

  // 1. Enrollment change
  const points = enrollmentPoints(input);
  const pct = kpis.enrollmentChangePct;
  if (points && pct !== null) {
    const span = `(${points.previous.period} → ${points.latest.period})`;
    if (pct > 0) {
      out.push({
        text: `Enrollment increased by ${pct}% compared to last month ${span}.`,
        type: "success",
      });
    } else if (pct < 0) {
      out.push({
        text: `Enrollment decreased by ${Math.abs(pct)}% compared to last month ${span}.`,
        type: "warning",
      });
    }
  }

  // 2. Attendance change
  const { latest, previous } = latestAttendance(input);
  const d = kpis.attendanceChange;
  if (latest && previous && d !== null) {
    if (d < -5) {
      out.push({
        text: `Average attendance dropped by ${Math.abs(d)} percentage points from ${previous.period} to ${latest.period}.`,
        type: "danger",
      });
    } else if (d > 5) {
      out.push({
        text: `Average attendance improved by ${d} percentage points from ${previous.period} to ${latest.period}.`,
        type: "success",
      });
    }
  }

  // 3. District attendance
  const r = kpis.attendanceRate;
  if (r !== null) {
    if (r < 60) {
      out.push({
        text: `District-wide attendance rate (${r}%) is below 60%.`,
        type: "danger",
      });
    } else if (r < 80) {
      out.push({
        text: `District-wide attendance rate (${r}%) is below 80%.`,
        type: "warning",
      });
    }
  }

  // 4. Critical schools
  const critical = countStatus(input.schools, "Critical");
  if (critical > 0) {
    out.push({
      text: `${critical} school${critical > 1 ? "s" : ""} ${critical > 1 ? "are" : "is"} in critical status (attendance below 60%).`,
      type: "danger",
    });
  }

  // 5. Warning schools
  const warning = countStatus(input.schools, "Warning");
  if (warning > 0) {
    out.push({
      text: `${warning} school${warning > 1 ? "s" : ""} ${warning > 1 ? "have" : "has"} warning status (attendance 60–80%).`,
      type: "warning",
    });
  }

  // 6. No attendance data
  const noData = kpis.schoolsNoData;
  if (noData > 0) {
    out.push({
      text: `${noData} school${noData > 1 ? "s have" : " has"} no attendance recorded in the last 30 days.`,
      type: "info",
    });
  }

  // 7. Open alerts
  const n = input.openAlerts;
  if (n > 0) {
    out.push({
      text: `There ${n === 1 ? "is" : "are"} ${n} open alert${n > 1 ? "s" : ""} requiring attention.`,
      type: n > 3 ? "danger" : "warning",
    });
  }

  // 8. Gender imbalance
  if (kpis.malePct !== null && kpis.femalePct !== null) {
    const gap = Math.abs(kpis.malePct - kpis.femalePct);
    if (gap > 20) {
      out.push({
        text: `Significant gender imbalance: ${kpis.malePct}% male, ${kpis.femalePct}% female (${gap}pt gap).`,
        type: "warning",
      });
    }
  }

  // 9. Fallback
  if (out.length === 0) {
    out.push({
      text: "All metrics are within normal ranges. No issues detected.",
      type: "success",
    });
  }

  return out.map((insight, i) => ({ id: `insight-${i}`, ...insight }));
}

function byNameThen<T extends { name: string }>(
  value: (x: T) => number,
  direction: 1 | -1,
): (a: T, b: T) => number {
  return (a, b) => {
    const diff = value(a) - value(b);
    if (diff !== 0) return diff * direction;
    return a.name.localeCompare(b.name);
  };
}

export function enrollmentBySchool(
  schools: AnalyticsSchool[],
): { schoolId: string; name: string; students: number }[] {
  return [...schools]
    .sort(byNameThen((s) => s.students, -1))
    .slice(0, 10)
    .map((s) => ({ schoolId: s.id, name: s.name, students: s.students }));
}

export function attendanceBySchool(schools: AnalyticsSchool[]): {
  rows: { schoolId: string; name: string; rate: number }[];
  withoutData: number;
} {
  const withData = schools.filter(
    (s): s is AnalyticsSchool & { attendanceRate: number } =>
      s.attendanceRate !== null,
  );
  const rows = withData
    .sort(byNameThen((s) => s.attendanceRate, 1))
    .slice(0, 10)
    .map((s) => ({ schoolId: s.id, name: s.name, rate: s.attendanceRate }));
  return { rows, withoutData: schools.length - withData.length };
}

export function teacherAnalytics(schools: AnalyticsSchool[]): {
  total: number;
  schoolsWithTeachers: number;
  avgPerSchool: number;
  bySchool: { schoolId: string; name: string; teachers: number }[];
} {
  const total = schools.reduce((sum, s) => sum + s.teachers, 0);
  const schoolsWithTeachers = schools.filter((s) => s.teachers > 0).length;
  return {
    total,
    schoolsWithTeachers,
    avgPerSchool:
      schoolsWithTeachers === 0 ? 0 : Math.round(total / schoolsWithTeachers),
    bySchool: schools
      .filter((s) => s.teachers > 0)
      .sort(byNameThen((s) => s.teachers, -1))
      .slice(0, 10)
      .map((s) => ({ schoolId: s.id, name: s.name, teachers: s.teachers })),
  };
}

export function schoolComparison(schools: AnalyticsSchool[]): {
  schoolId: string;
  name: string;
  students: number;
  attendanceRate: number | null;
  teachers: number;
}[] {
  return [...schools]
    .sort(byNameThen((s) => s.students, -1))
    .slice(0, 12)
    .map((s) => ({
      schoolId: s.id,
      name: s.name,
      students: s.students,
      attendanceRate: s.attendanceRate,
      teachers: s.teachers,
    }));
}

export function analyticsInputFromDashboard(
  result: DeoDashboardResult,
): AnalyticsInput {
  return {
    totalStudents: result.stats.totalStudents,
    chartData: result.chartData,
    schools: result.schools.map((s) => ({
      id: s.id,
      name: s.name,
      students: s.students,
      teachers: s.teachers,
      attendanceRate: s.attendanceRate,
      performanceStatus: s.performanceStatus,
    })),
    openAlerts: result.alertSummary.total,
  };
}
