"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface AttendanceTrendChartProps {
  data: { period: string; rate: number }[];
}

export default function AttendanceTrendChart({
  data,
}: AttendanceTrendChartProps) {
  if (!data) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <p className="text-gray-500">Loading attendance trend...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-2">No attendance data</p>
          <p className="text-sm text-gray-400">
            Attendance trends will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="period" stroke="#6b7280" style={{ fontSize: "12px" }} />
        <YAxis
          stroke="#6b7280"
          style={{ fontSize: "12px" }}
          domain={[0, 100]}
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "2px solid #e5e7eb",
            borderRadius: "8px",
            padding: "8px 12px",
          }}
          formatter={(value) => [`${value as number}%`, "Attendance Rate"]}
        />
        <ReferenceLine
          y={80}
          stroke="#22c55e"
          strokeDasharray="5 5"
          label={{
            value: "80% Target",
            position: "right",
            fontSize: 11,
            fill: "#22c55e",
          }}
        />
        <Line
          type="monotone"
          dataKey="rate"
          stroke="#3b82f6"
          strokeWidth={3}
          dot={{ fill: "#3b82f6", r: 5 }}
          activeDot={{ r: 7 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
