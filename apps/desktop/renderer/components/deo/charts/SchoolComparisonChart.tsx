"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SchoolComparisonItem {
  name: string;
  enrollment: number;
  attendanceRate: number | null;
  teachersCount: number;
}

interface SchoolComparisonChartProps {
  data: SchoolComparisonItem[];
}

export default function SchoolComparisonChart({
  data,
}: SchoolComparisonChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-1 text-sm">No comparison data</p>
          <p className="text-xs text-gray-400">
            School comparison will appear here once performance data is
            available.
          </p>
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    shortName: d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name,
  }));

  return (
    <ResponsiveContainer width="100%" height={400}>
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
        <XAxis type="number" stroke="#6b7280" style={{ fontSize: "11px" }} />
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
        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
        <Bar
          dataKey="enrollment"
          fill="#3b82f6"
          name="Enrollment"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
        />
        <Bar
          dataKey="attendanceRate"
          fill="#10b981"
          name="Attendance %"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
        />
        <Bar
          dataKey="teachersCount"
          fill="#8b5cf6"
          name="Teachers"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
