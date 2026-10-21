"use client";

import { Fragment } from "react";
import type { CountyAcademicReport } from "@nemis-desktop/types";
import { Building2, FileText, GraduationCap, TrendingUp, Users } from "lucide-react";
import { PassFailChart, SubjectPerformanceChart } from "./ReportCharts";
import { DistrictHeaderRow, ReportTable, SummaryCard, groupByDistrict } from "./report-display";

type SchoolRow = CountyAcademicReport["bySchool"][number];

function AcademicRow({ school }: { school: SchoolRow }) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-medium text-slate-800">{school.schoolName}</td>
      <td className="px-4 py-3 text-slate-500">{school.schoolCode}</td>
      <td className="px-4 py-3 text-right text-slate-600">{school.totalGrades.toLocaleString()}</td>
      <td className="px-4 py-3 text-right text-slate-600">{school.averageScore}%</td>
      <td className="px-4 py-3 text-right">
        <span
          className={`text-xs font-semibold px-2 py-0.5 ${
            school.passRate >= 80
              ? "text-slate-100 bg-active"
              : school.passRate >= 60
                ? "text-slate-100 bg-pending"
                : "text-slate-100 bg-error"
          }`}
        >
          {school.passRate}%
        </span>
      </td>
    </tr>
  );
}

/** Port of portal-web's AcademicReportView (published grades, current year). */
export function AcademicReportView({ data, isCountyWide }: { data: CountyAcademicReport; isCountyWide?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <SummaryCard label="Total Schools" value={data.summary.totalSchools} icon={Building2} valueColor="text-slate-900" />
        <SummaryCard label="Total Grades" value={data.summary.totalGrades} icon={FileText} valueColor="text-slate-900" />
        <SummaryCard
          label="Avg Score"
          value={data.summary.averageScore}
          icon={TrendingUp}
          valueColor="text-secondary"
          suffix="%"
        />
        <SummaryCard
          label="Pass Rate"
          value={data.summary.passRate}
          icon={GraduationCap}
          valueColor="text-active"
          suffix="%"
        />
        <SummaryCard label="Passed" value={data.summary.passCount} icon={Users} valueColor="text-active" />
        <SummaryCard label="Failed" value={data.summary.failCount} icon={Users} valueColor="text-error" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Pass / Fail</p>
          <PassFailChart passCount={data.summary.passCount} failCount={data.summary.failCount} />
        </div>
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Subject Performance</p>
          <SubjectPerformanceChart data={data.bySubject} />
        </div>
      </div>

      <ReportTable
        title="Performance by School"
        headers={["School", "Code", "Grades", "Avg Score", "Pass Rate"]}
        alignments={["left", "left", "right", "right", "right"]}
      >
        {isCountyWide
          ? groupByDistrict(data.bySchool).map((group) => (
              <Fragment key={group.districtId}>
                <DistrictHeaderRow name={group.districtName} colSpan={5} />
                {group.schools.map((s) => (
                  <AcademicRow key={s.schoolId} school={s} />
                ))}
              </Fragment>
            ))
          : data.bySchool.map((s) => <AcademicRow key={s.schoolId} school={s} />)}
      </ReportTable>
    </>
  );
}
