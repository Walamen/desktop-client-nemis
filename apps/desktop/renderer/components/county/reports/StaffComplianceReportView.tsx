"use client";

import { Fragment } from "react";
import type { CountyStaffComplianceReport } from "@nemis-desktop/types";
import { Building2, ClipboardCheck, GraduationCap, TrendingUp, Users } from "lucide-react";
import { ComplianceStatusChart, SchoolComplianceBarChart, TeacherQualificationChart } from "./ReportCharts";
import { DistrictHeaderRow, ReportTable, SummaryCard, groupByDistrict, teacherStudentRatio } from "./report-display";

type SchoolRow = CountyStaffComplianceReport["bySchool"][number];

function StaffRow({ school }: { school: SchoolRow }) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-medium text-slate-800">{school.schoolName}</td>
      <td className="px-4 py-3 text-right text-slate-600">{school.totalStudents.toLocaleString()}</td>
      <td className="px-4 py-3 text-right text-slate-600">{school.totalStaff}</td>
      <td className="px-4 py-3 text-right text-slate-600">{school.totalTeachers}</td>
      <td className="px-4 py-3 text-right text-emerald-600">{school.qualifiedTeachers}</td>
      <td className="px-4 py-3 text-right text-slate-600">{teacherStudentRatio(school.teacherStudentRatio)}</td>
      <td className="px-4 py-3 text-center">
        <span
          className={`text-xs font-semibold px-2 py-0.5 ${
            school.isCompliant ? "text-slate-100 bg-active" : "text-red-600 bg-red-50"
          }`}
        >
          {school.isCompliant ? "Compliant" : "Non-Compliant"}
        </span>
      </td>
    </tr>
  );
}

/** Port of portal-web's StaffComplianceReportView. */
export function StaffComplianceReportView({
  data,
  isCountyWide,
}: {
  data: CountyStaffComplianceReport;
  isCountyWide?: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Schools" value={data.summary.totalSchools} icon={Building2} valueColor="text-slate-900" />
        <SummaryCard label="Total Students" value={data.summary.totalStudents} icon={Users} valueColor="text-slate-900" />
        <SummaryCard label="Total Teachers" value={data.summary.totalTeachers} icon={GraduationCap} valueColor="text-slate-900" />
        <SummaryCard
          label="Compliance Rate"
          value={data.complianceStatus.complianceRate}
          icon={ClipboardCheck}
          valueColor="text-primary"
          suffix="%"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Staff" value={data.summary.totalStaff} icon={Users} valueColor="text-slate-900" />
        <SummaryCard
          label="Qualified Teachers"
          value={data.summary.qualifiedTeachers}
          icon={GraduationCap}
          valueColor="text-primary"
        />
        <SummaryCard
          label="Qualification Rate"
          value={data.summary.qualificationRate}
          icon={TrendingUp}
          valueColor="text-secondary"
          suffix="%"
        />
        <SummaryCard
          label="Teacher:Student"
          value={teacherStudentRatio(data.summary.overallTeacherStudentRatio)}
          icon={Users}
          valueColor="text-slate-900"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Compliance Status</p>
          <ComplianceStatusChart
            compliant={data.complianceStatus.compliant}
            nonCompliant={data.complianceStatus.nonCompliant}
          />
        </div>
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Teacher Qualification</p>
          <TeacherQualificationChart
            qualified={data.summary.qualifiedTeachers}
            unqualified={data.summary.totalTeachers - data.summary.qualifiedTeachers}
          />
        </div>
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">School Compliance</p>
          <SchoolComplianceBarChart data={data.bySchool} />
        </div>
      </div>

      <ReportTable
        title="Staff Details by School"
        headers={["School", "Students", "Staff", "Teachers", "Qualified", "Ratio", "Status"]}
        alignments={["left", "right", "right", "right", "right", "right", "center"]}
      >
        {isCountyWide
          ? groupByDistrict(data.bySchool).map((group) => (
              <Fragment key={group.districtId}>
                <DistrictHeaderRow name={group.districtName} colSpan={7} />
                {group.schools.map((s) => (
                  <StaffRow key={s.schoolId} school={s} />
                ))}
              </Fragment>
            ))
          : data.bySchool.map((s) => <StaffRow key={s.schoolId} school={s} />)}
      </ReportTable>
    </>
  );
}
