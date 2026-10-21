"use client";

import { Fragment } from "react";
import type { CountyAttendanceReport } from "@nemis-desktop/types";
import { Building2, FileText, TrendingUp, Users } from "lucide-react";
import { AttendanceStatusChart, AttendanceTrendChart } from "./ReportCharts";
import { DistrictHeaderRow, ReportTable, SummaryCard, groupByDistrict } from "./report-display";

type SchoolRow = CountyAttendanceReport["bySchool"][number];

function AttendanceRow({ school }: { school: SchoolRow }) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-medium text-slate-800">{school.schoolName}</td>
      <td className="px-4 py-3 text-right text-slate-600">{school.totalStudents.toLocaleString()}</td>
      <td className="px-4 py-3 text-right text-slate-600">{school.recordsCount.toLocaleString()}</td>
      <td className="px-4 py-3 text-right text-active">{school.present.toLocaleString()}</td>
      <td className="px-4 py-3 text-right text-error">{school.absent.toLocaleString()}</td>
      <td className="px-4 py-3 text-right text-pending">{school.late.toLocaleString()}</td>
      <td className="px-4 py-3 text-right">
        <span
          className={`text-xs font-semibold px-2 py-0.5 ${
            school.attendanceRate >= 90
              ? "text-slate-100 bg-active"
              : school.attendanceRate >= 75
                ? "text-slate-100 bg-pending"
                : "text-slate-100 bg-error"
          }`}
        >
          {school.attendanceRate}%
        </span>
      </td>
    </tr>
  );
}

/** Port of portal-web's AttendanceReportView. */
export function AttendanceReportView({ data, isCountyWide }: { data: CountyAttendanceReport; isCountyWide?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
        <SummaryCard label="Total Schools" value={data.summary.totalSchools} icon={Building2} valueColor="text-slate-900" />
        <SummaryCard label="Total Records" value={data.summary.totalRecords} icon={FileText} valueColor="text-slate-900" />
        <SummaryCard label="Present" value={data.summary.presentCount} icon={Users} valueColor="text-active" />
        <SummaryCard label="Absent" value={data.summary.absentCount} icon={Users} valueColor="text-error" />
        <SummaryCard label="Late" value={data.summary.lateCount} icon={Users} valueColor="text-pending" />
        <SummaryCard
          label="Attendance Rate"
          value={data.summary.overallAttendanceRate}
          icon={TrendingUp}
          valueColor="text-slate-900"
          suffix="%"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Attendance Status</p>
          <AttendanceStatusChart
            present={data.summary.presentCount}
            absent={data.summary.absentCount}
            late={data.summary.lateCount}
          />
        </div>
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Attendance Trend</p>
          <AttendanceTrendChart data={data.trendData} />
        </div>
      </div>

      <ReportTable
        title="Attendance by School"
        headers={["School", "Students", "Records", "Present", "Absent", "Late", "Rate"]}
        alignments={["left", "right", "right", "right", "right", "right", "right"]}
      >
        {isCountyWide
          ? groupByDistrict(data.bySchool).map((group) => (
              <Fragment key={group.districtId}>
                <DistrictHeaderRow name={group.districtName} colSpan={7} />
                {group.schools.map((s) => (
                  <AttendanceRow key={s.schoolId} school={s} />
                ))}
              </Fragment>
            ))
          : data.bySchool.map((s) => <AttendanceRow key={s.schoolId} school={s} />)}
      </ReportTable>
    </>
  );
}
