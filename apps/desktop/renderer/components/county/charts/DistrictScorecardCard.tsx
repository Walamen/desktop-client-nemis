"use client";

import { GraduationCap, Building2, Users } from "lucide-react";
import type {
  AttendanceComplianceData,
  EnrollmentByDistrictData,
  CountyDistrict as District,
  CountyDashboardStats as DashboardStats,
} from "@nemis-desktop/types";

interface DistrictScorecardCardProps {
  compliance: AttendanceComplianceData[];
  districts: District[];
  enrollmentByDistrict: EnrollmentByDistrictData[];
  stats: DashboardStats;
  countyName: string;
}

function tier(rate: number): "on-track" | "adequate" | "below" {
  if (rate >= 85) return "on-track";
  if (rate >= 50) return "adequate";
  return "below";
}

const TIER_COLORS = {
  "on-track": {
    text: "text-primary",
    bar: "bg-secondary/70",
    dot: "bg-secondary/70",
  },
  adequate: {
    text: "text-secondary",
    bar: "bg-secondary",
    dot: "bg-secondary",
  },
  below: { text: "text-slate-400", bar: "bg-slate-400", dot: "bg-slate-400" },
};

export default function DistrictScorecardCard({
  compliance,
  districts,
  enrollmentByDistrict,
  stats,
  countyName,
}: DistrictScorecardCardProps) {
  if (!compliance || compliance.length === 0 || !stats) {
    return (
      <div className="bg-white border border-slate-300 p-5 h-48 flex items-center justify-center">
        <div className="animate-spin  h-8 w-8 border-b-2 border-secondary" />
      </div>
    );
  }

  const sorted = [...compliance].sort(
    (a, b) => b.complianceRate - a.complianceRate,
  );
  const avgCompliance = Math.round(
    sorted.reduce((sum, d) => sum + d.complianceRate, 0) / sorted.length,
  );
  const onTrackCount = sorted.filter((d) => d.complianceRate >= 85).length;

  const enrollmentMap: Record<string, number> = {};
  for (const d of enrollmentByDistrict) {
    enrollmentMap[d.districtName.toLowerCase()] = d.studentCount;
  }

  const schoolCountMap: Record<string, number> = {};
  for (const d of districts) {
    schoolCountMap[d.name.toLowerCase()] = d._count?.institutions ?? 0;
  }

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-bold text-slate-700">
            District Education Scorecard
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            All {sorted.length} districts &middot; {countyName}
          </p>
        </div>
        <div className="text-right shrink-0 ml-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Avg Compliance
          </p>
          <p className="text-3xl font-bold text-slate-700">{avgCompliance}%</p>
        </div>
      </div>

      {/* KPI chips */}
      <div className="flex gap-2 mt-4 mb-5">
        <div className="flex items-center gap-2 bg-slate-50  px-3 py-2 flex-1 min-w-0">
          <GraduationCap className="w-4 h-4 text-secondary shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Students
            </p>
            <p className="text-sm font-bold text-slate-900 truncate">
              {(stats.totalStudents ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-50  px-3 py-2 flex-1 min-w-0">
          <Building2 className="w-4 h-4 text-secondary shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Schools
            </p>
            <p className="text-sm font-bold text-slate-900">
              {stats.totalSchools ?? 0}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-50  px-3 py-2 flex-1 min-w-0">
          <Users className="w-4 h-4 text-secondary shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              On Track
            </p>
            <p className="text-sm font-bold text-pending">
              {onTrackCount}/{sorted.length} districts
            </p>
          </div>
        </div>
      </div>

      {/* Ranked district list */}
      <div className="space-y-3">
        {sorted.map((item, index) => {
          const t = tier(item.complianceRate);
          const c = TIER_COLORS[t];
          const key = item.districtName.toLowerCase();
          const schoolCount = schoolCountMap[key] ?? 0;
          const studentCount = enrollmentMap[key] ?? 0;
          const stuLabel =
            studentCount >= 1000
              ? `${(studentCount / 1000).toFixed(1)}k`
              : String(studentCount);

          return (
            <div key={item.districtName}>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-4 shrink-0 text-right">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700 truncate">
                      {item.districtName}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400 hidden sm:block">
                        {schoolCount} sch &middot; {stuLabel} stu
                      </span>
                      <span className={`text-sm font-bold ${c.text}`}>
                        {item.complianceRate}%
                      </span>
                      <span className={`w-2 h-2  shrink-0 ${c.dot}`} />
                    </div>
                  </div>
                  <div className="mt-1.5 h-2 w-full bg-slate-100  overflow-hidden">
                    <div
                      className={`h-full  transition-all ${c.bar}`}
                      style={{ width: `${item.complianceRate}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
