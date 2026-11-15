"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface GenderDistributionChartProps {
  data: { male: number; female: number };
}

const COLORS = {
  male: "#0367A0",
  female: "#a6731c",
};

export default function GenderDistributionChart({
  data,
}: GenderDistributionChartProps) {
  if (!data) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <p className="text-gray-500">Loading gender distribution...</p>
      </div>
    );
  }

  const total = data.male + data.female;

  if (total === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-2">No gender distribution data</p>
          <p className="text-sm text-gray-400">
            Gender breakdown will appear here
          </p>
        </div>
      </div>
    );
  }

  const chartData = [
    { name: "Male", value: data.male, color: COLORS.male },
    { name: "Female", value: data.female, color: COLORS.female },
  ].filter((item) => item.value > 0);

  const malePercentage = Math.round((data.male / total) * 100);
  const femalePercentage = Math.round((data.female / total) * 100);

  return (
    <div className="relative h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#fff",
              border: "2px solid #e5e7eb",
              borderRadius: "8px",
              padding: "8px 12px",
            }}
            formatter={(value) => [
              `${(value as number).toLocaleString()} (${Math.round(((value as number) / total) * 100)}%)`,
              "",
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            formatter={(value) => {
              const percentage =
                value === "Male" ? malePercentage : femalePercentage;
              return (
                <span style={{ fontSize: "12px" }}>
                  {value} ({percentage}%)
                </span>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
        <div className="text-3xl font-bold text-gray-900">
          {total.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500">Total</div>
      </div>
    </div>
  );
}
