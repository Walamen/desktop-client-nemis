"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

interface AttendanceComparisonChartProps {
  data: { name: string; attendanceRate: number }[];
}

function getBarColor(rate: number): string {
  if (rate < 75) return "#ef4444"; // red
  if (rate < 85) return "#f59e0b"; // orange
  return "#22c55e"; // green
}

export default function AttendanceComparisonChart({
  data,
}: AttendanceComparisonChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-1 text-sm">
            No attendance comparison data
          </p>
          <p className="text-xs text-gray-400">
            School attendance rates will appear here once data is available.
          </p>
        </div>
      </div>
    );
  }

  // Sort by attendance rate ascending so worst performers are at top
  const sorted = [...data].sort((a, b) => a.attendanceRate - b.attendanceRate);

  const chartData = sorted.map((d) => ({
    ...d,
    shortName: d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name,
  }));

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />
          <span className="text-xs text-gray-600">&lt; 75%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" />
          <span className="text-xs text-gray-600">75–85%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />
          <span className="text-xs text-gray-600">&gt; 85%</span>
        </div>
      </div>

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
            domain={[0, 100]}
            stroke="#6b7280"
            style={{ fontSize: "11px" }}
            tickFormatter={(v: number) => `${v}%`}
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
            formatter={(value) => [`${value as number}%`, "Attendance Rate"]}
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
          <ReferenceLine
            x={75}
            stroke="#ef4444"
            strokeDasharray="5 5"
            strokeWidth={1.5}
          />
          <ReferenceLine
            x={85}
            stroke="#22c55e"
            strokeDasharray="5 5"
            strokeWidth={1.5}
          />
          <Bar dataKey="attendanceRate" radius={[0, 6, 6, 0]} maxBarSize={28}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getBarColor(entry.attendanceRate)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
