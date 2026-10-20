"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/** Port of portal-web components/reports/ReportCharts.tsx (the charts the
 * Enrollment and Financial reports use; the rest arrive with their reports). */
const C = {
  primary: "#000e21", // dark navy  — totals / trend lines
  secondary: "#0367A0", // brand blue — male / primary metric
  accent: "#1874A8", // mid blue   — pass rate / secondary positive
  active: "#146316", // green      — present / pass / compliant / collected / paid
  pending: "#a6731c", // amber      — female / late / partial / unqualified
  error: "#c10021", // red        — absent / fail / non-compliant / unpaid
  slate: "#CBD5E1", // slate-300  — expected / background bars
  slateText: "#64748B", // slate-500  — grid / axis hints
};

interface ChartProps {
  className?: string;
}

const GRADE_ORDER = ["KG", "K1", "K2", ...Array.from({ length: 12 }, (_, i) => `GRADE_${i + 1}`)];

/** KG, K1, K2, GRADE_1 … GRADE_12, then anything else, UNKNOWN last
 * (kept identical to portal-web's gradeLevelOrder). */
export function gradeLevelOrder(level: string): number {
  const index = GRADE_ORDER.indexOf(level);
  if (index >= 0) return index;
  return level === "UNKNOWN" ? GRADE_ORDER.length + 1 : GRADE_ORDER.length;
}

// ─── Enrollment Charts ─────────────────────────────────────────────────────

interface GenderDistributionProps extends ChartProps {
  male: number;
  female: number;
}

export function GenderDistributionChart({ male, female, className }: GenderDistributionProps) {
  const total = male + female;
  const malePercent = total > 0 ? Math.round((male / total) * 100) : 0;
  const femalePercent = total > 0 ? 100 - malePercent : 0;
  const data = [
    { name: "Male", value: male, pct: malePercent, color: C.secondary },
    { name: "Female", value: female, pct: femalePercent, color: C.pending },
  ];

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => (v as number).toLocaleString()} />
          <Legend
            formatter={(value) => {
              const item = data.find((d) => d.name === value);
              return `${value}: ${item?.value.toLocaleString()} (${item?.pct}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

interface GradeLevelChartProps extends ChartProps {
  data: Array<{ gradeLevel: string; male: number; female: number; total: number }>;
}

export function GradeLevelChart({ data, className }: GradeLevelChartProps) {
  const sorted = [...data].sort((a, b) => gradeLevelOrder(a.gradeLevel) - gradeLevelOrder(b.gradeLevel));
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={sorted} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis dataKey="gradeLevel" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => (v as number).toLocaleString()} />
          <Legend />
          <Bar dataKey="male" name="Male" fill={C.secondary} />
          <Bar dataKey="female" name="Female" fill={C.pending} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface EnrollmentTrendChartProps extends ChartProps {
  data: Array<{ month: string; count: number }>;
}

export function EnrollmentTrendChart({ data, className }: EnrollmentTrendChartProps) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => (v as number).toLocaleString()} />
          <Line
            type="monotone"
            dataKey="count"
            name="Students"
            stroke={C.primary}
            strokeWidth={2}
            dot={{ fill: C.primary, r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface EnrollmentByDistrictChartProps extends ChartProps {
  data: Array<{ districtName: string; totalStudents: number; totalMale: number; totalFemale: number }>;
}

export function EnrollmentByDistrictChart({ data, className }: EnrollmentByDistrictChartProps) {
  const sorted = [...data].sort((a, b) => b.totalStudents - a.totalStudents);
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={Math.max(220, sorted.length * 40)}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="districtName" tick={{ fontSize: 11 }} width={110} />
          <Tooltip formatter={(v) => (v as number).toLocaleString()} />
          <Legend />
          <Bar dataKey="totalMale" name="Male" stackId="a" fill={C.secondary} />
          <Bar dataKey="totalFemale" name="Female" stackId="a" fill={C.pending} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Financial Charts ──────────────────────────────────────────────────────

interface PaymentStatusChartProps extends ChartProps {
  paid: number;
  partial: number;
  unpaid: number;
}

export function PaymentStatusChart({ paid, partial, unpaid, className }: PaymentStatusChartProps) {
  const total = paid + partial + unpaid;
  const data = [
    { name: "Paid in Full", value: paid, color: C.active },
    { name: "Partial", value: partial, color: C.pending },
    { name: "No Payment", value: unpaid, color: C.error },
  ];
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) =>
              `${(v as number).toLocaleString()} (${total > 0 ? Math.round(((v as number) / total) * 100) : 0}%)`
            }
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CollectionByDistrictChartProps extends ChartProps {
  data: Array<{ districtName: string; totalExpected: number; totalCollected: number; collectionRate: number }>;
  currency?: string;
}

export function CollectionByDistrictChart({ data, currency = "LRD", className }: CollectionByDistrictChartProps) {
  const sorted = [...data].sort((a, b) => b.collectionRate - a.collectionRate);
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 48)}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
          <YAxis type="category" dataKey="districtName" tick={{ fontSize: 11 }} width={110} />
          <Tooltip formatter={(v) => `${currency} ${(v as number).toLocaleString()}`} />
          <Legend />
          <Bar dataKey="totalExpected" name="Expected" fill={C.slate} />
          <Bar dataKey="totalCollected" name="Collected" fill={C.active} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
