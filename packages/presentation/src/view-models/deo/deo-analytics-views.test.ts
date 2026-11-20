import type { DeoDashboardResult } from "@nemis-desktop/types";
import { describe, expect, it } from "vitest";
import {
  analyticsInputFromDashboard,
  analyticsInsights,
  analyticsKpis,
  attendanceBySchool,
  enrollmentBySchool,
  schoolComparison,
  teacherAnalytics,
  type AnalyticsInput,
  type AnalyticsSchool,
} from "./deo-analytics-views";

const school = (o: Partial<AnalyticsSchool> = {}): AnalyticsSchool => ({
  id: "s1",
  name: "School",
  students: 10,
  teachers: 1,
  attendanceRate: 90,
  performanceStatus: "Good",
  ...o,
});

const input = (o: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  totalStudents: 100,
  chartData: {
    enrollmentTrend: [],
    attendanceTrend: [],
    genderDistribution: { male: 50, female: 50 },
  },
  schools: [],
  openAlerts: 0,
  ...o,
});

const withChart = (
  c: Partial<AnalyticsInput["chartData"]>,
  o: Partial<AnalyticsInput> = {},
) => input({ ...o, chartData: { ...input().chartData, ...c } });

const att = (...rates: number[]) =>
  rates.map((rate, i) => ({ period: `M${i}`, rate }));
const texts = (i: AnalyticsInput) => analyticsInsights(i).map((x) => x.text);

describe("analyticsKpis", () => {
  it("computes enrollment change", () => {
    const k = analyticsKpis(
      withChart({
        enrollmentTrend: [
          { period: "a", enrollment: 100 },
          { period: "b", enrollment: 110 },
        ],
      }),
    );
    expect(k.enrollmentChangePct).toBe(10);
  });
  it("null for single point or zero previous", () => {
    expect(
      analyticsKpis(
        withChart({ enrollmentTrend: [{ period: "a", enrollment: 5 }] }),
      ).enrollmentChangePct,
    ).toBeNull();
    expect(
      analyticsKpis(
        withChart({
          enrollmentTrend: [
            { period: "a", enrollment: 0 },
            { period: "b", enrollment: 5 },
          ],
        }),
      ).enrollmentChangePct,
    ).toBeNull();
  });
  it("attendance rate and change", () => {
    const k = analyticsKpis(withChart({ attendanceTrend: att(0, 65, 70) }));
    expect(k.attendanceRate).toBe(70);
    expect(k.attendanceChange).toBe(5);
  });
  it("change null when month before is 0", () => {
    const k = analyticsKpis(withChart({ attendanceTrend: att(60, 0, 70) }));
    expect(k.attendanceRate).toBe(70);
    expect(k.attendanceChange).toBeNull();
  });
  it("all-zero trend gives null rate", () => {
    const k = analyticsKpis(withChart({ attendanceTrend: att(0, 0) }));
    expect(k.attendanceRate).toBeNull();
    expect(k.attendanceChange).toBeNull();
  });
  it("gender percentages", () => {
    const k = analyticsKpis(
      withChart({ genderDistribution: { male: 30, female: 70 } }),
    );
    expect([k.malePct, k.femalePct]).toEqual([30, 70]);
    const z = analyticsKpis(
      withChart({ genderDistribution: { male: 0, female: 0 } }),
    );
    expect([z.malePct, z.femalePct]).toEqual([null, null]);
  });
  it("school counts", () => {
    const k = analyticsKpis(
      input({
        schools: [
          school({ id: "1" }),
          school({ id: "2", performanceStatus: "Warning" }),
          school({ id: "3", performanceStatus: "Critical" }),
          school({ id: "4", performanceStatus: "No Data" }),
        ],
      }),
    );
    expect([k.schoolsGood, k.schoolsWarningOrCritical, k.schoolsNoData]).toEqual(
      [1, 2, 1],
    );
  });
});

describe("analyticsInsights", () => {
  const enr = (a: number, b: number) =>
    withChart({
      enrollmentTrend: [
        { period: "Jan", enrollment: a },
        { period: "Feb", enrollment: b },
      ],
    });
  it("enrollment up and down", () => {
    expect(analyticsInsights(enr(100, 110))[0]).toEqual({
      id: "insight-0",
      text: "Enrollment increased by 10% compared to last month (Jan → Feb).",
      type: "success",
    });
    expect(analyticsInsights(enr(100, 90))[0]).toEqual({
      id: "insight-0",
      text: "Enrollment decreased by 10% compared to last month (Jan → Feb).",
      type: "warning",
    });
  });
  it("attendance change thresholds", () => {
    const r = (a: number, b: number) =>
      analyticsInsights(withChart({ attendanceTrend: att(a, b) }));
    expect(r(90, 84)[0]).toEqual({
      id: "insight-0",
      text: "Average attendance dropped by 6 percentage points from M0 to M1.",
      type: "danger",
    });
    expect(r(80, 86)[0]).toEqual({
      id: "insight-0",
      text: "Average attendance improved by 6 percentage points from M0 to M1.",
      type: "success",
    });
    expect(r(90, 85)[0]!.text).toContain("normal ranges");
    expect(r(85, 90)[0]!.text).toContain("normal ranges");
  });
  it("district rate", () => {
    const r = (x: number) =>
      analyticsInsights(withChart({ attendanceTrend: att(x) }));
    expect(r(55)[0]).toEqual({
      id: "insight-0",
      text: "District-wide attendance rate (55%) is below 60%.",
      type: "danger",
    });
    expect(r(75)[0]).toEqual({
      id: "insight-0",
      text: "District-wide attendance rate (75%) is below 80%.",
      type: "warning",
    });
    expect(r(85)[0]!.type).toBe("success");
    expect(r(0)[0]!.type).toBe("success");
  });
  const many = (status: string, n: number) =>
    input({
      schools: Array.from({ length: n }, (_, i) =>
        school({ id: `x${i}`, performanceStatus: status }),
      ),
    });
  it("critical singular/plural", () => {
    expect(analyticsInsights(many("Critical", 1))[0]).toEqual({
      id: "insight-0",
      text: "1 school is in critical status (attendance below 60%).",
      type: "danger",
    });
    expect(texts(many("Critical", 2))[0]).toBe(
      "2 schools are in critical status (attendance below 60%).",
    );
  });
  it("warning singular/plural", () => {
    expect(analyticsInsights(many("Warning", 1))[0]).toEqual({
      id: "insight-0",
      text: "1 school has warning status (attendance 60–80%).",
      type: "warning",
    });
    expect(texts(many("Warning", 3))[0]).toBe(
      "3 schools have warning status (attendance 60–80%).",
    );
  });
  it("no data singular/plural", () => {
    expect(analyticsInsights(many("No Data", 1))[0]).toEqual({
      id: "insight-0",
      text: "1 school has no attendance recorded in the last 30 days.",
      type: "info",
    });
    expect(texts(many("No Data", 2))[0]).toBe(
      "2 schools have no attendance recorded in the last 30 days.",
    );
  });
  it("open alerts", () => {
    expect(analyticsInsights(input({ openAlerts: 1 }))[0]).toEqual({
      id: "insight-0",
      text: "There is 1 open alert requiring attention.",
      type: "warning",
    });
    expect(analyticsInsights(input({ openAlerts: 4 }))[0]).toEqual({
      id: "insight-0",
      text: "There are 4 open alerts requiring attention.",
      type: "danger",
    });
  });
  it("gender gap", () => {
    expect(
      analyticsInsights(
        withChart({ genderDistribution: { male: 39, female: 61 } }),
      )[0],
    ).toEqual({
      id: "insight-0",
      text: "Significant gender imbalance: 39% male, 61% female (22pt gap).",
      type: "warning",
    });
    expect(
      texts(withChart({ genderDistribution: { male: 40, female: 60 } }))[0],
    ).toContain("normal ranges");
  });
  it("fallback", () => {
    expect(analyticsInsights(input())).toEqual([
      {
        id: "insight-0",
        text: "All metrics are within normal ranges. No issues detected.",
        type: "success",
      },
    ]);
  });
  it("ids in order", () => {
    const out = analyticsInsights(
      withChart(
        {
          attendanceTrend: att(55),
          genderDistribution: { male: 10, female: 90 },
        },
        {
          openAlerts: 2,
          schools: [school({ performanceStatus: "Critical" })],
        },
      ),
    );
    expect(out.map((x) => x.id)).toEqual([
      "insight-0",
      "insight-1",
      "insight-2",
      "insight-3",
    ]);
    expect(out[0]!.text).toContain("below 60%.");
    expect(out[3]!.text).toContain("gender");
  });
  it("all-zero attendance with No Data schools makes no threshold or critical claims", () => {
    const out = texts(
      withChart(
        { attendanceTrend: att(0, 0, 0) },
        {
          schools: [
            school({
              id: "a",
              attendanceRate: null,
              performanceStatus: "No Data",
            }),
          ],
        },
      ),
    );
    expect(out).toEqual([
      "1 school has no attendance recorded in the last 30 days.",
    ]);
  });
});

describe("by-school series", () => {
  const twins = [
    school({ id: "a", name: "St. Mary", students: 5, teachers: 2, attendanceRate: 50 }),
    school({ id: "b", name: "St. Mary", students: 5, teachers: 2, attendanceRate: 60 }),
  ];
  it("same-name schools stay separate", () => {
    expect(enrollmentBySchool(twins).map((r) => r.schoolId)).toEqual(["a", "b"]);
    expect(teacherAnalytics(twins).bySchool.map((r) => r.schoolId)).toEqual([
      "a",
      "b",
    ]);
    expect(schoolComparison(twins).map((r) => r.schoolId)).toEqual(["a", "b"]);
    expect(attendanceBySchool(twins).rows.map((r) => r.schoolId)).toEqual([
      "a",
      "b",
    ]);
  });
  it("attendanceBySchool excludes nulls, sorts lowest first, counts withoutData", () => {
    const r = attendanceBySchool([
      school({ id: "a", attendanceRate: 90 }),
      school({ id: "b", attendanceRate: null }),
      school({ id: "c", attendanceRate: 70 }),
    ]);
    expect(r.rows.map((x) => x.schoolId)).toEqual(["c", "a"]);
    expect(r.withoutData).toBe(1);
  });
  it("top-N limits", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      school({
        id: `s${i}`,
        name: `S${String(i).padStart(2, "0")}`,
        students: i,
        teachers: i,
        attendanceRate: i,
      }),
    );
    expect(enrollmentBySchool(many)).toHaveLength(10);
    expect(attendanceBySchool(many).rows).toHaveLength(10);
    expect(teacherAnalytics(many).bySchool).toHaveLength(10);
    expect(schoolComparison(many)).toHaveLength(12);
    expect(enrollmentBySchool(many)[0]!.students).toBe(14);
  });
  it("ties broken by name", () => {
    const t = [
      school({ id: "z", name: "Zed", students: 5 }),
      school({ id: "a", name: "Alpha", students: 5 }),
    ];
    expect(enrollmentBySchool(t).map((r) => r.name)).toEqual(["Alpha", "Zed"]);
  });
  it("teacherAnalytics totals and empty", () => {
    expect(teacherAnalytics([])).toEqual({
      total: 0,
      schoolsWithTeachers: 0,
      avgPerSchool: 0,
      bySchool: [],
    });
    const r = teacherAnalytics([
      school({ id: "a", teachers: 3 }),
      school({ id: "b", teachers: 0 }),
    ]);
    expect([r.total, r.schoolsWithTeachers, r.avgPerSchool]).toEqual([3, 1, 3]);
    const q = teacherAnalytics([
      school({ id: "a", teachers: 3 }),
      school({ id: "b", teachers: 4 }),
      school({ id: "c", teachers: 0 }),
    ]);
    expect([q.total, q.schoolsWithTeachers, q.avgPerSchool]).toEqual([7, 2, 4]);
  });
});

describe("analyticsInputFromDashboard", () => {
  it("maps the dashboard result to the analytics input", () => {
    const chartData = {
      enrollmentTrend: [{ period: "Jan", enrollment: 5 }],
      attendanceTrend: [{ period: "Jan", rate: 80 }],
      genderDistribution: { male: 3, female: 2 },
    };
    const result: DeoDashboardResult = {
      districtId: "d1",
      district: null,
      county: null,
      stats: { totalSchools: 1, totalStudents: 42, totalTeachers: 3, feeCompliance: 0 },
      alerts: [],
      alertSummary: { total: 7, critical: 1, high: 2, medium: 2, low: 2 },
      schools: [
        {
          id: "s1",
          name: "Alpha",
          code: "AL",
          levels: ["PRIMARY"],
          students: 40,
          teachers: 3,
          attendanceRate: null,
          performanceStatus: "No Data",
          complianceStatus: "Compliant",
          feeCollectionRate: null,
          principalName: null,
        },
      ],
      chartData,
    };
    expect(analyticsInputFromDashboard(result)).toEqual({
      totalStudents: 42,
      chartData,
      schools: [
        {
          id: "s1",
          name: "Alpha",
          students: 40,
          teachers: 3,
          attendanceRate: null,
          performanceStatus: "No Data",
        },
      ],
      openAlerts: 7,
    });
  });
});
