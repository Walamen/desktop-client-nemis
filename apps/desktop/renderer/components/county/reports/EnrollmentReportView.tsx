"use client";

import type { CountyEnrollmentReport } from "@nemis-desktop/types";
import { Building2, TrendingUp, Users } from "lucide-react";
import {
  EnrollmentByDistrictChart,
  EnrollmentTrendChart,
  GenderDistributionChart,
  GradeLevelChart,
} from "./ReportCharts";
import { DistrictDivider, ReportTable, SummaryCard, groupByDistrict } from "./report-display";

const ENROLLMENT_HEADERS = ["School", "Code", "Total", "Male", "Female"];

/** Port of portal-web's EnrollmentReportView (county-wide and single-district). */
export function EnrollmentReportView({ data, isCountyWide }: { data: CountyEnrollmentReport; isCountyWide?: boolean }) {
  if (isCountyWide) {
    const districtGroups = groupByDistrict(data.bySchool);
    const byDistrictLookup = new Map((data.byDistrict ?? []).map((d) => [d.districtId, d]));

    return (
      <>
        {/* County summary cards */}
        <div className="grid grid-cols-2 2xl:grid-cols-4 gap-4">
          <SummaryCard label="Total Schools" value={data.summary.totalSchools} icon={Building2} valueColor="text-slate-900" />
          <SummaryCard label="Total Students" value={data.summary.totalStudents} icon={Users} valueColor="text-slate-900" />
          <SummaryCard label="Male Students" value={data.summary.totalMale} icon={Users} valueColor="text-sky-600" />
          <SummaryCard label="Female Students" value={data.summary.totalFemale} icon={Users} valueColor="text-pending" />
        </div>

        {/* Enrollment by district — stacked bar chart */}
        {data.byDistrict && data.byDistrict.length > 0 && (
          <div className="bg-white border border-slate-300 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Enrollment by District</p>
            <EnrollmentByDistrictChart data={data.byDistrict} />
          </div>
        )}

        {/* County-wide gender + grade level */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-300 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Gender Distribution</p>
            <GenderDistributionChart male={data.summary.totalMale} female={data.summary.totalFemale} />
          </div>
          <div className="bg-white border border-slate-300 p-5 lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">By Grade Level (County)</p>
            <GradeLevelChart data={data.byGradeLevel} />
          </div>
        </div>

        {/* Enrollment trend */}
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Enrollment Trend</p>
          <EnrollmentTrendChart data={data.trendData} />
        </div>

        {/* Per-district sections */}
        {districtGroups.map((group) => {
          const districtStats = byDistrictLookup.get(group.districtId);
          return (
            <div key={group.districtId} className="space-y-4">
              <DistrictDivider name={group.districtName} />

              {districtStats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <SummaryCard label="Schools" value={districtStats.totalSchools} icon={Building2} valueColor="text-slate-900" />
                  <SummaryCard label="Students" value={districtStats.totalStudents} icon={Users} valueColor="text-slate-900" />
                  <SummaryCard label="Male" value={districtStats.totalMale} icon={Users} valueColor="text-sky-600" />
                  <SummaryCard label="Female" value={districtStats.totalFemale} icon={Users} valueColor="text-pending" />
                </div>
              )}

              <div className="bg-white border border-slate-300 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {ENROLLMENT_HEADERS.map((h, i) => (
                          <th
                            key={h}
                            className={`px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400 ${i === 0 ? "text-left" : "text-right"}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.schools.map((school) => (
                        <tr key={school.schoolId} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{school.schoolName}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{school.schoolCode}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {school.totalStudents.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-secondary">{school.male.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-pending">{school.female.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  // ── Single-district view ──────────────────────────────────────────────────
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Total Schools" value={data.summary.totalSchools} icon={Building2} valueColor="text-slate-900" />
        <SummaryCard label="Total Students" value={data.summary.totalStudents} icon={Users} valueColor="text-slate-900" />
        <SummaryCard label="Male Students" value={data.summary.totalMale} icon={Users} valueColor="text-secondary" />
        <SummaryCard label="Female Students" value={data.summary.totalFemale} icon={Users} valueColor="text-pending" />
        <SummaryCard
          label="Gender Ratio"
          value={data.summary.genderRatio}
          icon={TrendingUp}
          valueColor="text-slate-900"
          suffix="M:F"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Gender Distribution</p>
          <GenderDistributionChart male={data.summary.totalMale} female={data.summary.totalFemale} />
        </div>
        <div className="bg-white border border-slate-300 p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">By Grade Level</p>
          <GradeLevelChart data={data.byGradeLevel} />
        </div>
      </div>

      <div className="bg-white border border-slate-300 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Enrollment Trend</p>
        <EnrollmentTrendChart data={data.trendData} />
      </div>

      <ReportTable title="Enrollment by School" headers={ENROLLMENT_HEADERS} alignments={["left", "left", "right", "right", "right"]}>
        {data.bySchool.map((school) => (
          <tr key={school.schoolId} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">{school.schoolName}</td>
            <td className="px-4 py-3 text-slate-500">{school.schoolCode}</td>
            <td className="px-4 py-3 text-right font-semibold text-slate-800">{school.totalStudents.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-secondary">{school.male.toLocaleString()}</td>
            <td className="px-4 py-3 text-right text-pending">{school.female.toLocaleString()}</td>
          </tr>
        ))}
      </ReportTable>
    </>
  );
}
