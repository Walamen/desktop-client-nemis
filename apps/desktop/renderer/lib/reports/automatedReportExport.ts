/**
 * Official-letterhead report exports (PDF, Excel, Word) for the County
 * Generate Reports page — a port of portal-web lib/automatedReportExport.ts.
 * Builders return the file's bytes; the page saves them through the app.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  Document,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  Packer,
} from "docx";
import type {
  CountyAcademicReport as AcademicReportData,
  CountyAttendanceReport as AttendanceReportData,
  CountyEnrollmentReport as EnrollmentReportData,
  CountyFinanceDashboard as CeoFinanceDashboard,
  CountySchoolFinanceRow as SchoolFinanceSummary,
  CountyStaffComplianceReport as StaffComplianceReportData,
} from "@nemis-desktop/types";
import { gradeLevelOrder } from "@/components/county/reports/ReportCharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type AutomatedReportData =
  | EnrollmentReportData
  | AttendanceReportData
  | AcademicReportData
  | StaffComplianceReportData;

export interface FinancialReportExportData {
  dashboard: CeoFinanceDashboard;
  schools: SchoolFinanceSummary[];
}

/** A built export, saved through the app (system:save-file). */
export interface ExportedFile {
  fileName: string;
  bytes: Uint8Array;
}

export interface ExportOptions {
  /** County-wide vs one district; the desktop rows always carry districtId,
   * so the page says which it is. */
  countyWide?: boolean;
  includeCharts?: boolean;
  chartImages?: string[];
  countyName?: string;
  countyCode?: string;
  generatedBy?: string;
}

// ─── Brand Colors ────────────────────────────────────────────────────────────

// PDF: rgb tuples for jsPDF and autoTable
const P = {
  primary: [0, 14, 33] as [number, number, number],
  secondary: [3, 103, 160] as [number, number, number],
  active: [20, 99, 22] as [number, number, number],
  error: [193, 0, 33] as [number, number, number],
  rowAlt: [232, 244, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  textMid: [80, 80, 80] as [number, number, number],
};

// Word: hex strings
const W = {
  primary: "000E21",
  secondary: "0367A0",
  rowAlt: "E8F3F9",
};

// ─── Shared autoTable defaults ────────────────────────────────────────────────

const tableStyle = {
  theme: "striped" as const,
  headStyles: { fillColor: P.secondary, textColor: P.white },
  alternateRowStyles: { fillColor: P.rowAlt },
  margin: { left: 15, right: 15 },
  styles: { fontSize: 9, cellPadding: 3 },
};

// ─── PDF Helpers ─────────────────────────────────────────────────────────────

type PDFCell =
  | string
  | number
  | {
      content: string | number;
      colSpan?: number;
      styles?: Record<string, unknown>;
    };
type PDFRow = PDFCell[];

function districtRow(name: string, colCount: number): PDFRow {
  return [
    {
      content: name.toUpperCase(),
      colSpan: colCount,
      styles: {
        fillColor: P.primary,
        textColor: P.white,
        fontStyle: "bold",
        fontSize: 8,
      } as Record<string, unknown>,
    },
  ];
}

function groupedRows<
  T extends { districtId?: string | null; districtName?: string | null },
>(
  items: T[],
  colCount: number,
  mapper: (s: T) => (string | number)[],
): PDFRow[] {
  const hasDistricts = items.some((s) => !!s.districtId);
  if (!hasDistricts) return items.map(mapper);

  const groups = new Map<string, { name: string; items: T[] }>();
  for (const s of items) {
    const key = s.districtId ?? "_unknown";
    if (!groups.has(key))
      groups.set(key, {
        name: s.districtName ?? "Unknown District",
        items: [],
      });
    groups.get(key)!.items.push(s);
  }

  const rows: PDFRow[] = [];
  for (const [, g] of groups) {
    rows.push(districtRow(g.name, colCount));
    rows.push(...g.items.map(mapper));
  }
  return rows;
}

function section(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...P.secondary);
  doc.text(title, 15, y);
  doc.setTextColor(0, 0, 0);
  return y + 7;
}

function guardPage(doc: jsPDF, y: number, minRoom = 50): number {
  if (y > doc.internal.pageSize.getHeight() - minRoom) {
    doc.addPage();
    return 20;
  }
  return y;
}

function finalY(doc: jsPDF): number {
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;
}

function letterhead(
  doc: jsPDF,
  opts: ExportOptions,
  title: string,
  scopeLabel: string,
  generatedAt: string,
): number {
  const w = doc.internal.pageSize.getWidth();
  const cx = w / 2;

  doc.setFillColor(...P.primary);
  doc.rect(0, 0, w, 52, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("REPUBLIC OF LIBERIA", cx, 14, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Ministry of Education", cx, 22, { align: "center" });
  doc.setFontSize(9);
  doc.text("National Education Management Information System (NEMIS)", cx, 30, {
    align: "center",
  });
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`${opts.countyName ?? ""} County Education Office`, cx, 40, {
    align: "center",
  });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`County Code: ${opts.countyCode ?? "N/A"}`, cx, 47, {
    align: "center",
  });

  let y = 58;
  doc.setTextColor(...P.secondary);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(title, cx, y, { align: "center" });
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...P.textMid);
  doc.text(scopeLabel, 15, y);
  doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, w - 15, y, {
    align: "right",
  });
  y += 5;

  if (opts.generatedBy) {
    doc.text(`Prepared by: ${opts.generatedBy}`, 15, y);
    y += 5;
  }

  doc.setDrawColor(...P.secondary);
  doc.setLineWidth(0.8);
  doc.line(15, y, w - 15, y);
  doc.setLineWidth(0.2);
  y += 8;

  doc.setTextColor(0, 0, 0);
  return y;
}

function footer(doc: jsPDF, opts: ExportOptions): void {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const text = `Page {p} of {t} | Republic of Liberia — Ministry of Education — NEMIS | ${opts.countyName ?? ""} County | Official & Confidential`;

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      text.replace("{p}", String(i)).replace("{t}", String(pages)),
      w / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" },
    );
  }
}

function isCountyWide(report: AutomatedReportData, options: ExportOptions): boolean {
  if (options.countyWide !== undefined) return options.countyWide;
  if (report.reportType === "ENROLLMENT")
    return !!(report as EnrollmentReportData).byDistrict?.length;
  return (report.bySchool as Array<{ districtId?: string }>).some(
    (s) => !!s.districtId,
  );
}

// ─── Standard PDF Export ─────────────────────────────────────────────────────

export async function exportToPDF(
  report: AutomatedReportData,
  options: ExportOptions = {},
): Promise<ExportedFile> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const countyWide = isCountyWide(report, options);
  const isCounty = !!options.countyName;

  let y: number;

  if (isCounty) {
    const scopeLabel = countyWide
      ? "Scope: County-Wide (All Districts)"
      : `District: ${report.district.name}`;
    y = letterhead(
      doc,
      options,
      getReportTitle(report.reportType),
      scopeLabel,
      report.generatedAt,
    );
  } else {
    // Fallback DEO header
    doc.setFillColor(...P.primary);
    doc.rect(0, 0, pageWidth, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("NEMIS", 15, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("National Education Management Information System", 15, 26);
    doc.setFontSize(14);
    doc.text(getReportTitle(report.reportType), pageWidth - 15, 22, {
      align: "right",
    });
    y = 45;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`District: ${report.district.name}`, 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
      pageWidth - 15,
      y,
      { align: "right" },
    );
    y += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, pageWidth - 15, y);
    y += 10;
  }

  // Summary
  y = section(doc, "Summary", y);
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: getSummaryRows(report),
    ...tableStyle,
    columnStyles: { 0: { cellWidth: 80 } },
  });
  y = finalY(doc) + 12;

  // Report-specific sections
  switch (report.reportType) {
    case "ENROLLMENT": {
      const r = report as EnrollmentReportData;

      // Enrollment by District (county-wide)
      if (r.byDistrict && r.byDistrict.length > 0) {
        y = guardPage(doc, y);
        y = section(doc, "Enrollment by District", y);
        autoTable(doc, {
          startY: y,
          head: [
            [
              "District",
              "Schools",
              "Students",
              "Male",
              "Female",
              "Ratio (M:F)",
            ],
          ],
          body: r.byDistrict.map((d) => [
            d.districtName,
            d.totalSchools,
            d.totalStudents,
            d.totalMale,
            d.totalFemale,
            d.genderRatio,
          ]),
          ...tableStyle,
        });
        y = finalY(doc) + 12;
      }

      // By Grade Level
      if (r.byGradeLevel && r.byGradeLevel.length > 0) {
        const sorted = [...r.byGradeLevel].sort(
          (a, b) => gradeLevelOrder(a.gradeLevel) - gradeLevelOrder(b.gradeLevel),
        );
        y = guardPage(doc, y);
        y = section(doc, "Enrollment by Grade Level", y);
        autoTable(doc, {
          startY: y,
          head: [["Grade Level", "Male", "Female", "Total"]],
          body: sorted.map((g) => [g.gradeLevel, g.male, g.female, g.total]),
          ...tableStyle,
          columnStyles: { 0: { cellWidth: 50 } },
        });
        y = finalY(doc) + 12;
      }

      // Trend
      if (r.trendData && r.trendData.length > 0) {
        y = guardPage(doc, y);
        y = section(doc, "Enrollment Trend", y);
        autoTable(doc, {
          startY: y,
          head: [["Month", "Student Count"]],
          body: r.trendData.map((t) => [t.month, t.count]),
          ...tableStyle,
          columnStyles: { 0: { cellWidth: 60 } },
        });
        y = finalY(doc) + 12;
      }

      // Schools Breakdown
      y = guardPage(doc, y, 80);
      y = section(doc, "Schools Breakdown", y);
      autoTable(doc, {
        startY: y,
        head: [["School Name", "Code", "Total", "Male", "Female"]],
        body: groupedRows(r.bySchool, 5, (s) => [
          s.schoolName,
          s.schoolCode,
          s.totalStudents,
          s.male,
          s.female,
        ]),
        ...tableStyle,
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 60 } },
      });
      break;
    }

    case "ATTENDANCE": {
      const r = report as AttendanceReportData;

      // Trend
      if (r.trendData && r.trendData.length > 0) {
        y = guardPage(doc, y);
        y = section(
          doc,
          `Attendance Trend — ${r.period.type} (${r.period.start} → ${r.period.end})`,
          y,
        );
        autoTable(doc, {
          startY: y,
          head: [["Date", "Rate (%)", "Present", "Absent"]],
          body: r.trendData.map((t) => [
            t.date,
            `${t.rate}%`,
            t.present,
            t.absent,
          ]),
          ...tableStyle,
        });
        y = finalY(doc) + 12;
      }

      // Schools Breakdown
      y = guardPage(doc, y, 80);
      y = section(doc, "Schools Breakdown", y);
      autoTable(doc, {
        startY: y,
        head: [
          [
            "School Name",
            "Code",
            "Students",
            "Records",
            "Present",
            "Absent",
            "Late",
            "Rate (%)",
          ],
        ],
        body: groupedRows(r.bySchool, 8, (s) => [
          s.schoolName,
          s.schoolCode,
          s.totalStudents,
          s.recordsCount,
          s.present,
          s.absent,
          s.late,
          s.attendanceRate,
        ]),
        ...tableStyle,
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 50 } },
      });
      break;
    }

    case "ACADEMIC": {
      const r = report as AcademicReportData;

      // By Subject
      if (r.bySubject && r.bySubject.length > 0) {
        y = guardPage(doc, y);
        y = section(doc, "Performance by Subject", y);
        autoTable(doc, {
          startY: y,
          head: [["Subject", "Total Grades", "Avg Score (%)", "Pass Rate (%)"]],
          body: r.bySubject.map((s) => [
            s.subjectName,
            s.totalGrades,
            s.averageScore,
            s.passRate,
          ]),
          ...tableStyle,
        });
        y = finalY(doc) + 12;
      }

      // Schools Breakdown
      y = guardPage(doc, y, 80);
      y = section(doc, "Schools Breakdown", y);
      autoTable(doc, {
        startY: y,
        head: [
          ["School Name", "Code", "Grades", "Avg Score (%)", "Pass Rate (%)"],
        ],
        body: groupedRows(r.bySchool, 5, (s) => [
          s.schoolName,
          s.schoolCode,
          s.totalGrades,
          s.averageScore,
          s.passRate,
        ]),
        ...tableStyle,
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 60 } },
      });
      break;
    }

    case "STAFF_COMPLIANCE": {
      const r = report as StaffComplianceReportData;

      // Compliance Overview
      y = guardPage(doc, y);
      y = section(doc, "Compliance Overview", y);
      autoTable(doc, {
        startY: y,
        head: [["Status", "Schools", "Rate (%)"]],
        body: [
          [
            "Compliant",
            r.complianceStatus.compliant,
            `${r.complianceStatus.complianceRate}%`,
          ],
          [
            "Non-Compliant",
            r.complianceStatus.nonCompliant,
            `${(100 - r.complianceStatus.complianceRate).toFixed(1)}%`,
          ],
          ["Total", r.complianceStatus.total, ""],
        ],
        ...tableStyle,
        didParseCell: (data) => {
          if (data.section === "body") {
            const label = String((data.row.raw as string[])[0]);
            if (label === "Compliant") data.cell.styles.textColor = P.active;
            if (label === "Non-Compliant") data.cell.styles.textColor = P.error;
          }
        },
        columnStyles: { 0: { cellWidth: 60 } },
      });
      y = finalY(doc) + 12;

      // Schools Breakdown
      y = guardPage(doc, y, 80);
      y = section(doc, "Schools Breakdown", y);
      autoTable(doc, {
        startY: y,
        head: [
          [
            "School Name",
            "Code",
            "Students",
            "Staff",
            "Teachers",
            "Qualified",
            "Ratio",
            "✓",
          ],
        ],
        body: groupedRows(r.bySchool, 8, (s) => [
          s.schoolName,
          s.schoolCode,
          s.totalStudents,
          s.totalStaff,
          s.totalTeachers,
          s.qualifiedTeachers,
          s.teacherStudentRatio,
          s.isCompliant ? "✓" : "✗",
        ]),
        ...tableStyle,
        styles: { fontSize: 7, cellPadding: 2 },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 7) {
            const v = String(data.cell.raw ?? "");
            data.cell.styles.textColor = v === "✓" ? P.active : P.error;
            data.cell.styles.fontStyle = "bold";
          }
        },
        columnStyles: { 0: { cellWidth: 50 } },
      });
      break;
    }
  }

  footer(doc, options);

  const slug = options.countyName
    ? `${options.countyName.replace(/\s+/g, "-")}-`
    : "";
  const scope = countyWide
    ? "county"
    : report.district.name.replace(/\s+/g, "-");
  return { fileName: `${slug}${report.reportType.toLowerCase()}-report-${scope}-${new Date().toISOString().split("T")[0]}.pdf`, bytes: new Uint8Array(doc.output("arraybuffer")) };
}

// ─── Financial PDF Export ─────────────────────────────────────────────────────

export async function exportFinancialToPDF(
  data: FinancialReportExportData,
  options: ExportOptions = {},
): Promise<ExportedFile> {
  const { dashboard, schools } = data;
  const doc = new jsPDF();
  const currency = dashboard.currency ?? "LRD";
  const fmt = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (n: number) => `${n.toFixed(1)}%`;

  let y = letterhead(
    doc,
    options,
    "Financial Report",
    "Scope: County-Wide (All Districts)",
    new Date().toISOString(),
  );

  // Summary
  y = section(doc, "Summary", y);
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Total Expected", fmt(dashboard.totalExpected)],
      ["Total Collected", fmt(dashboard.totalCollected)],
      ["Total Outstanding", fmt(dashboard.totalOutstanding)],
      ["Collection Rate", pct(dashboard.collectionRate)],
      [
        "Schools Reporting",
        `${dashboard.schoolsReporting} / ${dashboard.totalSchools}`,
      ],
      ["Students — Paid", dashboard.studentsPaid.toLocaleString()],
      ["Students — Partial", dashboard.studentsPartial.toLocaleString()],
      ["Students — Unpaid", dashboard.studentsUnpaid.toLocaleString()],
    ],
    ...tableStyle,
    columnStyles: { 0: { cellWidth: 80 } },
  });
  y = finalY(doc) + 12;

  // Collection by District
  if (dashboard.districtComparison && dashboard.districtComparison.length > 0) {
    y = guardPage(doc, y);
    y = section(doc, "Collection by District", y);
    autoTable(doc, {
      startY: y,
      head: [
        [
          "District",
          "Expected",
          "Collected",
          "Outstanding",
          "Rate (%)",
          "Schools",
        ],
      ],
      body: dashboard.districtComparison.map((d) => [
        d.districtName,
        fmt(d.totalExpected),
        fmt(d.totalCollected),
        fmt(d.totalExpected - d.totalCollected),
        pct(d.collectionRate),
        d.schoolCount,
      ]),
      ...tableStyle,
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 45 } },
    });
    y = finalY(doc) + 12;
  }

  // Schools Breakdown
  if (schools.length > 0) {
    y = guardPage(doc, y, 80);
    y = section(doc, "Schools Breakdown", y);
    autoTable(doc, {
      startY: y,
      head: [
        [
          "School",
          "Expected",
          "Collected",
          "Outstanding",
          "Rate",
          "Students",
          "Paid",
          "Partial",
          "Unpaid",
        ],
      ],
      body: groupedRows(schools, 9, (s) => [
        s.institutionName,
        fmt(s.totalExpected),
        fmt(s.totalCollected),
        fmt(s.totalOutstanding),
        pct(s.collectionRate),
        s.studentCount,
        s.paidCount,
        s.partialCount,
        s.unpaidCount,
      ]),
      ...tableStyle,
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 42 } },
    });
  }

  footer(doc, options);

  const slug = options.countyName
    ? `${options.countyName.replace(/\s+/g, "-")}-`
    : "";
  return { fileName: `${slug}financial-report-${new Date().toISOString().split("T")[0]}.pdf`, bytes: new Uint8Array(doc.output("arraybuffer")) };
}

// ─── Standard Excel Export ────────────────────────────────────────────────────

export function exportToExcel(
  report: AutomatedReportData,
  options: ExportOptions = {},
): ExportedFile {
  const wb = XLSX.utils.book_new();
  const isCounty = !!options.countyName;
  const countyWide = isCountyWide(report, options);
  const scopeLabel = countyWide
    ? "All Districts (County-Wide)"
    : report.district.name;

  const metaRows: string[][] = isCounty
    ? [
        ["REPUBLIC OF LIBERIA"],
        [
          "Ministry of Education — National Education Management Information System (NEMIS)",
        ],
        [
          `${options.countyName} County Education Office  |  County Code: ${options.countyCode ?? "N/A"}`,
        ],
        [],
        ["Report Type", getReportTitle(report.reportType)],
        ["Scope", scopeLabel],
        ["Generated", new Date(report.generatedAt).toLocaleString()],
        ...(options.generatedBy ? [["Prepared by", options.generatedBy]] : []),
        [],
        ["Summary"],
      ]
    : [
        ["NEMIS Automated Report"],
        ["Report Type", getReportTitle(report.reportType)],
        ["District", report.district.name],
        ["Generated", new Date(report.generatedAt).toLocaleString()],
        [],
        ["Summary"],
      ];

  const summaryWs = XLSX.utils.aoa_to_sheet([
    ...metaRows,
    ...getSummaryRows(report),
  ]);
  summaryWs["!cols"] = [{ wch: 35 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  // By School (with District column when county-wide)
  const { headers, rows } = getSchoolRows(report, countyWide);
  const detailsWs = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  detailsWs["!cols"] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, detailsWs, "By School");

  if (report.reportType === "ENROLLMENT") {
    const r = report as EnrollmentReportData;

    if (r.byDistrict && r.byDistrict.length > 0) {
      const ws = XLSX.utils.aoa_to_sheet([
        ["District", "Schools", "Students", "Male", "Female", "Ratio (M:F)"],
        ...r.byDistrict.map((d) => [
          d.districtName,
          d.totalSchools,
          d.totalStudents,
          d.totalMale,
          d.totalFemale,
          d.genderRatio,
        ]),
      ]);
      ws["!cols"] = [{ wch: 28 }, ...Array(5).fill({ wch: 14 })];
      XLSX.utils.book_append_sheet(wb, ws, "By District");
    }

    const sorted = [...r.byGradeLevel].sort(
      (a, b) => gradeLevelOrder(a.gradeLevel) - gradeLevelOrder(b.gradeLevel),
    );
    const gradeWs = XLSX.utils.aoa_to_sheet([
      ["Grade Level", "Male", "Female", "Total"],
      ...sorted.map((g) => [g.gradeLevel, g.male, g.female, g.total]),
    ]);
    XLSX.utils.book_append_sheet(wb, gradeWs, "By Grade Level");

    const trendWs = XLSX.utils.aoa_to_sheet([
      ["Month", "Enrollment Count"],
      ...r.trendData.map((t) => [t.month, t.count]),
    ]);
    XLSX.utils.book_append_sheet(wb, trendWs, "Enrollment Trend");
  }

  if (report.reportType === "ATTENDANCE") {
    const r = report as AttendanceReportData;
    const trendWs = XLSX.utils.aoa_to_sheet([
      ["Date", "Attendance Rate (%)", "Present", "Absent"],
      ...r.trendData.map((t) => [t.date, t.rate, t.present, t.absent]),
    ]);
    XLSX.utils.book_append_sheet(wb, trendWs, "Attendance Trend");
  }

  if (report.reportType === "ACADEMIC") {
    const r = report as AcademicReportData;
    const subjectWs = XLSX.utils.aoa_to_sheet([
      ["Subject", "Total Grades", "Average Score (%)", "Pass Rate (%)"],
      ...r.bySubject.map((s) => [
        s.subjectName,
        s.totalGrades,
        s.averageScore,
        s.passRate,
      ]),
    ]);
    XLSX.utils.book_append_sheet(wb, subjectWs, "By Subject");
  }

  if (report.reportType === "STAFF_COMPLIANCE") {
    const r = report as StaffComplianceReportData;
    const compWs = XLSX.utils.aoa_to_sheet([
      ["Status", "Schools", "Rate (%)"],
      [
        "Compliant",
        r.complianceStatus.compliant,
        r.complianceStatus.complianceRate,
      ],
      [
        "Non-Compliant",
        r.complianceStatus.nonCompliant,
        +(100 - r.complianceStatus.complianceRate).toFixed(1),
      ],
      ["Total", r.complianceStatus.total, ""],
    ]);
    XLSX.utils.book_append_sheet(wb, compWs, "Compliance Status");
  }

  const slug = options.countyName
    ? `${options.countyName.replace(/\s+/g, "-")}-`
    : "";
  const scope = countyWide
    ? "county"
    : report.district.name.replace(/\s+/g, "-");
  return {
    fileName: `${slug}${report.reportType.toLowerCase()}-report-${scope}-${new Date().toISOString().split("T")[0]}.xlsx`,
    bytes: new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer),
  };
}

// ─── Financial Excel Export ───────────────────────────────────────────────────

export function exportFinancialToExcel(
  data: FinancialReportExportData,
  options: ExportOptions = {},
): ExportedFile {
  const { dashboard, schools } = data;
  const wb = XLSX.utils.book_new();
  const currency = dashboard.currency ?? "LRD";
  const fmt = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Summary
  const summaryWs = XLSX.utils.aoa_to_sheet([
    ["REPUBLIC OF LIBERIA"],
    [
      "Ministry of Education — National Education Management Information System (NEMIS)",
    ],
    [
      `${options.countyName ?? ""} County Education Office  |  County Code: ${options.countyCode ?? "N/A"}`,
    ],
    [],
    ["Report Type", "Financial Report"],
    ["Scope", "County-Wide (All Districts)"],
    ["Generated", new Date().toLocaleString()],
    ...(options.generatedBy ? [["Prepared by", options.generatedBy]] : []),
    [],
    ["Summary"],
    ["Total Expected", fmt(dashboard.totalExpected)],
    ["Total Collected", fmt(dashboard.totalCollected)],
    ["Total Outstanding", fmt(dashboard.totalOutstanding)],
    ["Collection Rate", `${dashboard.collectionRate.toFixed(1)}%`],
    [
      "Schools Reporting",
      `${dashboard.schoolsReporting} / ${dashboard.totalSchools}`,
    ],
    ["Students — Paid", dashboard.studentsPaid],
    ["Students — Partial", dashboard.studentsPartial],
    ["Students — Unpaid", dashboard.studentsUnpaid],
  ]);
  summaryWs["!cols"] = [{ wch: 35 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  // District Comparison
  if (dashboard.districtComparison && dashboard.districtComparison.length > 0) {
    const distWs = XLSX.utils.aoa_to_sheet([
      [
        "District",
        "Expected",
        "Collected",
        "Outstanding",
        "Rate (%)",
        "Schools",
      ],
      ...dashboard.districtComparison.map((d) => [
        d.districtName,
        fmt(d.totalExpected),
        fmt(d.totalCollected),
        fmt(d.totalExpected - d.totalCollected),
        `${d.collectionRate.toFixed(1)}%`,
        d.schoolCount,
      ]),
    ]);
    distWs["!cols"] = [
      { wch: 28 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 12 },
      { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, distWs, "By District");
  }

  // Schools
  const schoolsWs = XLSX.utils.aoa_to_sheet([
    [
      "School",
      "District",
      "Expected",
      "Collected",
      "Outstanding",
      "Rate (%)",
      "Students",
      "Paid",
      "Partial",
      "Unpaid",
    ],
    ...schools.map((s) => [
      s.institutionName,
      s.districtName,
      fmt(s.totalExpected),
      fmt(s.totalCollected),
      fmt(s.totalOutstanding),
      `${s.collectionRate.toFixed(1)}%`,
      s.studentCount,
      s.paidCount,
      s.partialCount,
      s.unpaidCount,
    ]),
  ]);
  schoolsWs["!cols"] = [
    { wch: 32 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, schoolsWs, "By School");

  const slug = options.countyName
    ? `${options.countyName.replace(/\s+/g, "-")}-`
    : "";
  return {
    fileName: `${slug}financial-report-${new Date().toISOString().split("T")[0]}.xlsx`,
    bytes: new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer),
  };
}

// ─── Standard Word Export ─────────────────────────────────────────────────────

export async function exportToWord(
  report: AutomatedReportData,
  options: ExportOptions = {},
): Promise<ExportedFile> {
  const isCounty = !!options.countyName;
  const countyWide = isCountyWide(report, options);
  const scopeLabel = countyWide
    ? "All Districts (County-Wide)"
    : report.district.name;

  const headerBlocks: Paragraph[] = isCounty
    ? [
        wp("REPUBLIC OF LIBERIA", {
          bold: true,
          size: 32,
          color: W.primary,
          align: AlignmentType.CENTER,
        }),
        wp("Ministry of Education", {
          size: 24,
          color: W.secondary,
          align: AlignmentType.CENTER,
        }),
        wp("National Education Management Information System (NEMIS)", {
          size: 20,
          color: "666666",
          align: AlignmentType.CENTER,
          after: 120,
        }),
        wp(`${options.countyName} County Education Office`, {
          bold: true,
          size: 26,
          color: W.primary,
          align: AlignmentType.CENTER,
        }),
        wp(`County Code: ${options.countyCode ?? "N/A"}`, {
          size: 18,
          color: "888888",
          align: AlignmentType.CENTER,
          after: 300,
        }),
      ]
    : [
        wp("NEMIS", {
          bold: true,
          size: 48,
          color: W.primary,
          align: AlignmentType.CENTER,
        }),
        wp("National Education Management Information System", {
          size: 22,
          color: "666666",
          align: AlignmentType.CENTER,
          after: 400,
        }),
      ];

  const metaRuns: TextRun[] = [
    new TextRun({ text: "Scope: ", bold: true }),
    new TextRun({ text: scopeLabel }),
    new TextRun({ text: "     |     " }),
    new TextRun({ text: "Generated: ", bold: true }),
    new TextRun({ text: new Date(report.generatedAt).toLocaleString() }),
    ...(isCounty && options.generatedBy
      ? [
          new TextRun({ text: "     |     " }),
          new TextRun({ text: "Prepared by: ", bold: true }),
          new TextRun({ text: options.generatedBy }),
        ]
      : []),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          ...headerBlocks,
          wp(getReportTitle(report.reportType), {
            bold: true,
            size: 32,
            color: W.primary,
            align: AlignmentType.CENTER,
            after: 200,
          }),
          new Paragraph({
            children: metaRuns,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          wh("Summary"),
          wt(["Metric", "Value"], getSummaryRows(report)),
          ...buildWordSections(report),
        ],
      },
    ],
  });

  const bytes = new Uint8Array(await Packer.toArrayBuffer(doc));
  const slug = options.countyName
    ? `${options.countyName.replace(/\s+/g, "-")}-`
    : "";
  const scope = countyWide
    ? "county"
    : report.district.name.replace(/\s+/g, "-");
  return { fileName: `${slug}${report.reportType.toLowerCase()}-report-${scope}-${new Date().toISOString().split("T")[0]}.docx`, bytes };
}

// ─── Financial Word Export ────────────────────────────────────────────────────

export async function exportFinancialToWord(
  data: FinancialReportExportData,
  options: ExportOptions = {},
): Promise<ExportedFile> {
  const { dashboard, schools } = data;
  const currency = dashboard.currency ?? "LRD";
  const fmt = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (n: number) => `${n.toFixed(1)}%`;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          wp("REPUBLIC OF LIBERIA", {
            bold: true,
            size: 32,
            color: W.primary,
            align: AlignmentType.CENTER,
          }),
          wp("Ministry of Education", {
            size: 24,
            color: W.secondary,
            align: AlignmentType.CENTER,
          }),
          wp("National Education Management Information System (NEMIS)", {
            size: 20,
            color: "666666",
            align: AlignmentType.CENTER,
            after: 120,
          }),
          wp(`${options.countyName ?? ""} County Education Office`, {
            bold: true,
            size: 26,
            color: W.primary,
            align: AlignmentType.CENTER,
          }),
          wp(`County Code: ${options.countyCode ?? "N/A"}`, {
            size: 18,
            color: "888888",
            align: AlignmentType.CENTER,
            after: 300,
          }),
          wp("Financial Report", {
            bold: true,
            size: 32,
            color: W.primary,
            align: AlignmentType.CENTER,
            after: 200,
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({ text: "Scope: County-Wide (All Districts)" }),
              new TextRun({ text: "     |     " }),
              new TextRun({ text: "Generated: ", bold: true }),
              new TextRun({ text: new Date().toLocaleString() }),
              ...(options.generatedBy
                ? [
                    new TextRun({
                      text: `     |     Prepared by: ${options.generatedBy}`,
                    }),
                  ]
                : []),
            ],
          }),

          wh("Summary"),
          wt(
            ["Metric", "Value"],
            [
              ["Total Expected", fmt(dashboard.totalExpected)],
              ["Total Collected", fmt(dashboard.totalCollected)],
              ["Total Outstanding", fmt(dashboard.totalOutstanding)],
              ["Collection Rate", pct(dashboard.collectionRate)],
              [
                "Schools Reporting",
                `${dashboard.schoolsReporting} / ${dashboard.totalSchools}`,
              ],
              ["Students — Paid", String(dashboard.studentsPaid)],
              ["Students — Partial", String(dashboard.studentsPartial)],
              ["Students — Unpaid", String(dashboard.studentsUnpaid)],
            ],
          ),

          ...(dashboard.districtComparison?.length
            ? [
                wh("Collection by District"),
                wt(
                  ["District", "Expected", "Collected", "Rate (%)", "Schools"],
                  dashboard.districtComparison.map((d) => [
                    d.districtName,
                    fmt(d.totalExpected),
                    fmt(d.totalCollected),
                    pct(d.collectionRate),
                    String(d.schoolCount),
                  ]),
                ),
              ]
            : []),

          ...(schools.length
            ? [
                wh("Schools Breakdown"),
                wt(
                  [
                    "School",
                    "District",
                    "Expected",
                    "Collected",
                    "Rate",
                    "Students",
                    "Paid",
                    "Partial",
                    "Unpaid",
                  ],
                  schools.map((s) => [
                    s.institutionName,
                    s.districtName ?? "",
                    fmt(s.totalExpected),
                    fmt(s.totalCollected),
                    pct(s.collectionRate),
                    String(s.studentCount),
                    String(s.paidCount),
                    String(s.partialCount),
                    String(s.unpaidCount),
                  ]),
                ),
              ]
            : []),
        ],
      },
    ],
  });

  const bytes = new Uint8Array(await Packer.toArrayBuffer(doc));
  const slug = options.countyName
    ? `${options.countyName.replace(/\s+/g, "-")}-`
    : "";
  return { fileName: `${slug}financial-report-${new Date().toISOString().split("T")[0]}.docx`, bytes };
}

// ─── Helper Data Functions ────────────────────────────────────────────────────

function getReportTitle(reportType: string): string {
  return (
    {
      ENROLLMENT: "Enrollment Report",
      ATTENDANCE: "Attendance Report",
      ACADEMIC: "Academic Performance Report",
      STAFF_COMPLIANCE: "Staff & Compliance Report",
      FINANCIAL: "Financial Report",
    }[reportType] ?? "Report"
  );
}

function getSummaryRows(report: AutomatedReportData): string[][] {
  switch (report.reportType) {
    case "ENROLLMENT": {
      const r = report as EnrollmentReportData;
      return [
        ["Total Schools", r.summary.totalSchools.toLocaleString()],
        ["Total Students", r.summary.totalStudents.toLocaleString()],
        ["Male Students", r.summary.totalMale.toLocaleString()],
        ["Female Students", r.summary.totalFemale.toLocaleString()],
        ["Gender Ratio (M:F)", r.summary.genderRatio],
      ];
    }
    case "ATTENDANCE": {
      const r = report as AttendanceReportData;
      return [
        ["Total Schools", r.summary.totalSchools.toLocaleString()],
        ["Total Records", r.summary.totalRecords.toLocaleString()],
        ["Present", r.summary.presentCount.toLocaleString()],
        ["Absent", r.summary.absentCount.toLocaleString()],
        ["Late", r.summary.lateCount.toLocaleString()],
        ["Overall Attendance Rate", `${r.summary.overallAttendanceRate}%`],
      ];
    }
    case "ACADEMIC": {
      const r = report as AcademicReportData;
      return [
        ["Total Schools", r.summary.totalSchools.toLocaleString()],
        ["Total Grades Recorded", r.summary.totalGrades.toLocaleString()],
        ["Average Score", `${r.summary.averageScore}%`],
        ["Pass Rate", `${r.summary.passRate}%`],
        ["Passed", r.summary.passCount.toLocaleString()],
        ["Failed", r.summary.failCount.toLocaleString()],
      ];
    }
    case "STAFF_COMPLIANCE": {
      const r = report as StaffComplianceReportData;
      return [
        ["Total Schools", r.summary.totalSchools.toLocaleString()],
        ["Total Students", r.summary.totalStudents.toLocaleString()],
        ["Total Staff", r.summary.totalStaff.toLocaleString()],
        ["Total Teachers", r.summary.totalTeachers.toLocaleString()],
        ["Qualified Teachers", r.summary.qualifiedTeachers.toLocaleString()],
        ["Qualification Rate", `${r.summary.qualificationRate}%`],
        ["Teacher:Student Ratio", r.summary.overallTeacherStudentRatio],
        [
          "Compliant Schools",
          `${r.complianceStatus.compliant} / ${r.complianceStatus.total}`,
        ],
        ["Compliance Rate", `${r.complianceStatus.complianceRate}%`],
      ];
    }
    default:
      return [];
  }
}

function getSchoolRows(
  report: AutomatedReportData,
  includeDistrict: boolean,
): { headers: string[]; rows: (string | number)[][] } {
  switch (report.reportType) {
    case "ENROLLMENT": {
      const r = report as EnrollmentReportData;
      const headers = includeDistrict
        ? ["District", "School Name", "Code", "Total", "Male", "Female"]
        : ["School Name", "Code", "Total", "Male", "Female"];
      const rows = r.bySchool.map((s) =>
        includeDistrict
          ? [
              s.districtName ?? "",
              s.schoolName,
              s.schoolCode,
              s.totalStudents,
              s.male,
              s.female,
            ]
          : [s.schoolName, s.schoolCode, s.totalStudents, s.male, s.female],
      );
      return { headers, rows };
    }
    case "ATTENDANCE": {
      const r = report as AttendanceReportData;
      const headers = includeDistrict
        ? [
            "District",
            "School Name",
            "Code",
            "Students",
            "Records",
            "Present",
            "Absent",
            "Late",
            "Rate (%)",
          ]
        : [
            "School Name",
            "Code",
            "Students",
            "Records",
            "Present",
            "Absent",
            "Late",
            "Rate (%)",
          ];
      const rows = r.bySchool.map((s) =>
        includeDistrict
          ? [
              s.districtName ?? "",
              s.schoolName,
              s.schoolCode,
              s.totalStudents,
              s.recordsCount,
              s.present,
              s.absent,
              s.late,
              s.attendanceRate,
            ]
          : [
              s.schoolName,
              s.schoolCode,
              s.totalStudents,
              s.recordsCount,
              s.present,
              s.absent,
              s.late,
              s.attendanceRate,
            ],
      );
      return { headers, rows };
    }
    case "ACADEMIC": {
      const r = report as AcademicReportData;
      const headers = includeDistrict
        ? [
            "District",
            "School Name",
            "Code",
            "Grades",
            "Avg Score (%)",
            "Pass Rate (%)",
          ]
        : ["School Name", "Code", "Grades", "Avg Score (%)", "Pass Rate (%)"];
      const rows = r.bySchool.map((s) =>
        includeDistrict
          ? [
              s.districtName ?? "",
              s.schoolName,
              s.schoolCode,
              s.totalGrades,
              s.averageScore,
              s.passRate,
            ]
          : [
              s.schoolName,
              s.schoolCode,
              s.totalGrades,
              s.averageScore,
              s.passRate,
            ],
      );
      return { headers, rows };
    }
    case "STAFF_COMPLIANCE": {
      const r = report as StaffComplianceReportData;
      const headers = includeDistrict
        ? [
            "District",
            "School Name",
            "Code",
            "Students",
            "Staff",
            "Teachers",
            "Qualified",
            "Ratio",
            "Compliant",
          ]
        : [
            "School Name",
            "Code",
            "Students",
            "Staff",
            "Teachers",
            "Qualified",
            "Ratio",
            "Compliant",
          ];
      const rows = r.bySchool.map((s) =>
        includeDistrict
          ? [
              s.districtName ?? "",
              s.schoolName,
              s.schoolCode,
              s.totalStudents,
              s.totalStaff,
              s.totalTeachers,
              s.qualifiedTeachers,
              s.teacherStudentRatio,
              s.isCompliant ? "Yes" : "No",
            ]
          : [
              s.schoolName,
              s.schoolCode,
              s.totalStudents,
              s.totalStaff,
              s.totalTeachers,
              s.qualifiedTeachers,
              s.teacherStudentRatio,
              s.isCompliant ? "Yes" : "No",
            ],
      );
      return { headers, rows };
    }
    default:
      return { headers: [], rows: [] };
  }
}

function buildWordSections(report: AutomatedReportData): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  switch (report.reportType) {
    case "ENROLLMENT": {
      const r = report as EnrollmentReportData;
      if (r.byDistrict && r.byDistrict.length > 0) {
        out.push(wh("Enrollment by District"));
        out.push(
          wt(
            ["District", "Schools", "Students", "Male", "Female", "Ratio"],
            r.byDistrict.map((d) => [
              d.districtName,
              String(d.totalSchools),
              String(d.totalStudents),
              String(d.totalMale),
              String(d.totalFemale),
              d.genderRatio,
            ]),
          ),
        );
      }
      const sorted = [...r.byGradeLevel].sort(
        (a, b) => gradeLevelOrder(a.gradeLevel) - gradeLevelOrder(b.gradeLevel),
      );
      out.push(wh("Enrollment by Grade Level"));
      out.push(
        wt(
          ["Grade Level", "Male", "Female", "Total"],
          sorted.map((g) => [
            g.gradeLevel,
            String(g.male),
            String(g.female),
            String(g.total),
          ]),
        ),
      );
      out.push(wh("Enrollment Trend"));
      out.push(
        wt(
          ["Month", "Student Count"],
          r.trendData.map((t) => [t.month, String(t.count)]),
        ),
      );
      out.push(wh("Schools Breakdown"));
      out.push(
        wt(
          ["School Name", "Code", "Total", "Male", "Female"],
          r.bySchool.map((s) => [
            s.schoolName,
            s.schoolCode,
            String(s.totalStudents),
            String(s.male),
            String(s.female),
          ]),
        ),
      );
      break;
    }
    case "ATTENDANCE": {
      const r = report as AttendanceReportData;
      out.push(wh("Attendance Trend"));
      out.push(
        wt(
          ["Date", "Rate (%)", "Present", "Absent"],
          r.trendData.map((t) => [
            t.date,
            `${t.rate}%`,
            String(t.present),
            String(t.absent),
          ]),
        ),
      );
      out.push(wh("Schools Breakdown"));
      out.push(
        wt(
          [
            "School Name",
            "Code",
            "Students",
            "Records",
            "Present",
            "Absent",
            "Late",
            "Rate (%)",
          ],
          r.bySchool.map((s) => [
            s.schoolName,
            s.schoolCode,
            String(s.totalStudents),
            String(s.recordsCount),
            String(s.present),
            String(s.absent),
            String(s.late),
            String(s.attendanceRate),
          ]),
        ),
      );
      break;
    }
    case "ACADEMIC": {
      const r = report as AcademicReportData;
      out.push(wh("Performance by Subject"));
      out.push(
        wt(
          ["Subject", "Total Grades", "Avg Score (%)", "Pass Rate (%)"],
          r.bySubject.map((s) => [
            s.subjectName,
            String(s.totalGrades),
            String(s.averageScore),
            String(s.passRate),
          ]),
        ),
      );
      out.push(wh("Schools Breakdown"));
      out.push(
        wt(
          ["School Name", "Code", "Grades", "Avg Score (%)", "Pass Rate (%)"],
          r.bySchool.map((s) => [
            s.schoolName,
            s.schoolCode,
            String(s.totalGrades),
            String(s.averageScore),
            String(s.passRate),
          ]),
        ),
      );
      break;
    }
    case "STAFF_COMPLIANCE": {
      const r = report as StaffComplianceReportData;
      out.push(wh("Compliance Overview"));
      out.push(
        wt(
          ["Status", "Schools", "Rate (%)"],
          [
            [
              "Compliant",
              String(r.complianceStatus.compliant),
              `${r.complianceStatus.complianceRate}%`,
            ],
            [
              "Non-Compliant",
              String(r.complianceStatus.nonCompliant),
              `${(100 - r.complianceStatus.complianceRate).toFixed(1)}%`,
            ],
            ["Total", String(r.complianceStatus.total), ""],
          ],
        ),
      );
      out.push(wh("Schools Breakdown"));
      out.push(
        wt(
          [
            "School Name",
            "Code",
            "Students",
            "Staff",
            "Teachers",
            "Qualified",
            "Ratio",
            "Compliant",
          ],
          r.bySchool.map((s) => [
            s.schoolName,
            s.schoolCode,
            String(s.totalStudents),
            String(s.totalStaff),
            String(s.totalTeachers),
            String(s.qualifiedTeachers),
            s.teacherStudentRatio,
            s.isCompliant ? "Yes" : "No",
          ]),
        ),
      );
      break;
    }
  }
  return out;
}

// ─── Word / Download Utilities ────────────────────────────────────────────────

function wp(
  text: string,
  opts?: {
    bold?: boolean;
    size?: number;
    color?: string;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    after?: number;
  },
): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size,
        color: opts?.color,
      }),
    ],
    alignment: opts?.align,
    spacing: { after: opts?.after ?? 60 },
  });
}

function wh(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 160 },
  });
}

function wt(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (h) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: h, bold: true, color: "FFFFFF" }),
                  ],
                }),
              ],
              shading: { fill: W.secondary },
            }),
        ),
      }),
      ...rows.map(
        (row, idx) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ text: String(cell) })],
                  shading: idx % 2 === 0 ? { fill: W.rowAlt } : undefined,
                  borders: {
                    top: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                    bottom: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                    left: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                    right: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                  },
                }),
            ),
          }),
      ),
    ],
  });
}

