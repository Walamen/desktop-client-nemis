"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface EnrollmentTrendChartProps {
  data: { period: string; enrollment: number }[];
}

export default function EnrollmentTrendChart({
  data,
}: EnrollmentTrendChartProps) {
  if (!data) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <p className="text-gray-500">Loading enrollment trend...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-2">No enrollment trend data</p>
          <p className="text-sm text-gray-400">
            Enrollment trends will appear here
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
          tickFormatter={(value) => value.toLocaleString()}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "2px solid #e5e7eb",
            borderRadius: "8px",
            padding: "8px 12px",
          }}
          formatter={(value) => [
            (value as number).toLocaleString(),
            "Enrollment",
          ]}
        />
        <Line
          type="monotone"
          dataKey="enrollment"
          stroke="#020b33"
          strokeWidth={3}
          dot={{ fill: "#020b33", r: 5 }}
          activeDot={{ r: 7 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
