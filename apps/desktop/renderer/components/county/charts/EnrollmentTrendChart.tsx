"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { CountyEnrollmentTrendData } from "@nemis-desktop/types";

const chartConfig = {
  male: { label: "Male", color: "#0367A0" },
  female: { label: "Female", color: "#a6731c" },
} satisfies ChartConfig;

interface EnrollmentTrendChartProps {
  data: CountyEnrollmentTrendData[];
}

export default function EnrollmentTrendChart({
  data,
}: EnrollmentTrendChartProps) {
  const [activeKey, setActiveKey] = useState<"male" | "female">("male");

  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <p className="text-gray-500">No enrollment trend data</p>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d[activeKey], 0);

  return (
    <div>
      <div className="flex gap-3 mb-4">
        {(["male", "female"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setActiveKey(key)}
            className={`flex flex-col gap-0.5 px-3 py-2   border border-slate-300 transition-colors text-left ${
              activeKey === key
                ? "border-slate-300 bg-slate-50"
                : "border-transparent hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-1.5 text-xs text-slate-500 capitalize">
              <span
                className="inline-block size-2 "
                style={{ backgroundColor: chartConfig[key].color }}
              />
              {chartConfig[key].label}
            </span>
            <span className="text-lg font-semibold text-slate-900">
              {activeKey === key ? total.toLocaleString() : "—"}
            </span>
          </button>
        ))}
      </div>
      <ChartContainer config={chartConfig} className="h-[240px] w-full">
        <BarChart data={data} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e5e7eb" />
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            style={{ fontSize: "12px" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            style={{ fontSize: "12px" }}
            tickFormatter={(v: number) => v.toLocaleString()}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            dataKey="male"
            fill="var(--color-male)"
            radius={[4, 4, 0, 0]}
            fillOpacity={activeKey === "male" ? 1 : 0.2}
          />
          <Bar
            dataKey="female"
            fill="var(--color-female)"
            radius={[4, 4, 0, 0]}
            fillOpacity={activeKey === "female" ? 1 : 0.2}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
