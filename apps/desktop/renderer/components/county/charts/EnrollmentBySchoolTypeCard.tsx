"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { InstitutionLevel } from "@nemis-desktop/types";
import type { GenderDistributionData } from "@nemis-desktop/types";

interface EnrollmentBySchoolTypeCardProps {
  byLevel: Record<string, number>;
  genderDistribution?: GenderDistributionData;
}

const GROUPS = [
  {
    label: "Secondary",
    levels: [InstitutionLevel.SECONDARY],
    color: "#0367A0",
  },
  { label: "Primary", levels: [InstitutionLevel.PRIMARY], color: "#a6731c" },
  {
    label: "Pre-Primary",
    levels: [InstitutionLevel.PRE_PRIMARY],
    color: "#b45309",
  },
  {
    label: "Technical",
    levels: [InstitutionLevel.CERTIFICATE],
    color: "#8099A8",
  },
  { label: "Vocational", levels: [InstitutionLevel.DIPLOMA], color: "#78350f" },
] as const;

function formatEnrolled(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

const GENDER_GROUPS = [
  { label: "Male", key: "male" as const, color: "#3180ad" },
  { label: "Female", key: "female" as const, color: "#a97a13" },
];

export default function EnrollmentBySchoolTypeCard({
  byLevel,
  genderDistribution,
}: EnrollmentBySchoolTypeCardProps) {
  const grouped = GROUPS.map((g) => ({
    label: g.label,
    color: g.color,
    count: g.levels.reduce((sum, level) => sum + (byLevel[level] ?? 0), 0),
  })).filter((g) => g.count > 0);

  const total = grouped.reduce((sum, g) => sum + g.count, 0);

  if (grouped.length === 0) {
    return (
      <div className="bg-white border border-slate-300 p-5 h-48 flex items-center justify-center">
        <p className="text-sm text-slate-400">No enrollment data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-bold text-slate-700">
            Enrollment by School Type
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Distribution across all registered schools
          </p>
        </div>
        <span className="bg-slate-100 text-slate-600  px-3 py-1 text-xs font-semibold shrink-0 ml-4 self-start">
          {total.toLocaleString()} total
        </span>
      </div>

      {/* Chart + Legend */}
      <div className="flex items-center gap-4 mt-4">
        {/* Donut chart */}
        <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={grouped}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={76}
                paddingAngle={2}
                strokeWidth={0}
              >
                {grouped.map((g) => (
                  <Cell key={g.label} fill={g.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-none">
              Enrolled
            </p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">
              {formatEnrolled(total)}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3 min-w-0">
          {grouped.map((g) => {
            const pct = total > 0 ? Math.round((g.count / total) * 100) : 0;
            return (
              <div key={g.label}>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3  shrink-0"
                    style={{ backgroundColor: g.color }}
                  />
                  <span className="text-sm text-slate-700 flex-1">
                    {g.label}
                  </span>
                  <span className="text-sm text-slate-400">
                    {g.count.toLocaleString()}
                  </span>
                  <span
                    className="text-sm font-bold w-10 text-right"
                    style={{ color: g.color }}
                  >
                    {pct}%
                  </span>
                </div>
                <div className="mt-1 h-2 w-full bg-slate-100  overflow-hidden ">
                  <div
                    className="h-full"
                    style={{ width: `${pct}%`, backgroundColor: g.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gender Distribution */}
      {genderDistribution &&
        genderDistribution.male + genderDistribution.female > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
              Gender Distribution
            </p>
            <div className="space-y-3">
              {GENDER_GROUPS.map((g) => {
                const count = genderDistribution[g.key];
                const genderTotal =
                  genderDistribution.male + genderDistribution.female;
                const pct =
                  genderTotal > 0 ? Math.round((count / genderTotal) * 100) : 0;
                return (
                  <div key={g.label}>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3  shrink-0"
                        style={{ backgroundColor: g.color }}
                      />
                      <span className="text-sm text-slate-700 flex-1">
                        {g.label}
                      </span>
                      <span className="text-sm text-slate-400">
                        {count.toLocaleString()}
                      </span>
                      <span
                        className="text-sm font-bold w-10 text-right"
                        style={{ color: g.color }}
                      >
                        {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full bg-slate-100  overflow-hidden ">
                      <div
                        className="h-full"
                        style={{ width: `${pct}%`, backgroundColor: g.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
}
