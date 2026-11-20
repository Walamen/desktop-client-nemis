"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface EnrollmentBySchoolChartProps {
  data: { name: string; enrollment: number }[];
}

export default function EnrollmentBySchoolChart({
  data,
}: EnrollmentBySchoolChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-1 text-sm">
            No school enrollment data
          </p>
          <p className="text-xs text-gray-400">
            School-level enrollment will appear here once data is available.
          </p>
        </div>
      </div>
    );
  }

  // Truncate long school names for chart labels
  const chartData = data.map((d) => ({
    ...d,
    shortName: d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name,
  }));

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e5e7eb"
          horizontal={false}
        />
        <XAxis
          type="number"
          stroke="#6b7280"
          style={{ fontSize: "11px" }}
          tickFormatter={(v: number) => v.toLocaleString()}
        />
        <YAxis
          type="category"
          dataKey="shortName"
          width={140}
          stroke="#6b7280"
          style={{ fontSize: "11px" }}
          tick={{ fill: "#374151" }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "8px 12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
          formatter={(value) => [
            (value as number).toLocaleString(),
            "Students",
          ]}
          labelFormatter={(label) => {
            const match = data.find(
              (d) =>
                d.name === String(label) ||
                (d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name) ===
                  String(label),
            );
            return match?.name || String(label);
          }}
        />
        <Bar
          dataKey="enrollment"
          fill="#3b82f6"
          radius={[0, 6, 6, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
