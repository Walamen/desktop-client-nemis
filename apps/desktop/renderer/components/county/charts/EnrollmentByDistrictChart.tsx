"use client";

import { useState } from "react";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EnrollmentByDistrictData } from "@nemis-desktop/types";

const chartConfig = {
  studentCount: { label: "Students", color: "#0367A0" },
} satisfies ChartConfig;

interface EnrollmentByDistrictChartProps {
  data: EnrollmentByDistrictData[];
}

export default function EnrollmentByDistrictChart({
  data,
}: EnrollmentByDistrictChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <p className="text-gray-500">No enrollment data available</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.studentCount - a.studentCount);
  const total = sorted.reduce((sum, d) => sum + d.studentCount, 0);
  const height = Math.max(200, sorted.length * 40);

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => setActiveIndex(null)}
          className={`flex flex-col gap-0.5 px-3 py-2  border border-slate-300 transition-colors text-left ${
            activeIndex === null
              ? "border-slate-300 bg-slate-50"
              : "border-transparent hover:bg-slate-50"
          }`}
        >
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span
              className="inline-block size-2 "
              style={{ backgroundColor: chartConfig.studentCount.color }}
            />
            {chartConfig.studentCount.label}
          </span>
          <span className="text-lg font-semibold text-slate-900">
            {total.toLocaleString()}
          </span>
        </button>
      </div>

      <ChartContainer
        config={chartConfig}
        style={{ height }}
        className="w-full"
      >
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
            }
          />
          <YAxis
            type="category"
            dataKey="districtName"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12 }}
            width={130}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelKey="districtName"
                className="bg-slate-800 border-slate-700 text-white [&_span]:text-white"
              />
            }
          />
          <Bar
            dataKey="studentCount"
            radius={[0, 4, 4, 0]}
            style={{ cursor: "pointer" }}
            onClick={(_, index) =>
              setActiveIndex(activeIndex === index ? null : index)
            }
          >
            {sorted.map((_, index) => (
              <Cell
                key={index}
                fill={chartConfig.studentCount.color}
                fillOpacity={
                  activeIndex === null || activeIndex === index ? 1 : 0.2
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
