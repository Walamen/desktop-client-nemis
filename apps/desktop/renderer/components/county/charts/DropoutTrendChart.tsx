"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DropoutTrendData } from "@nemis-desktop/types";

const chartConfig = {
  dropouts: { label: "Dropouts", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig;

interface DropoutTrendChartProps {
  data: DropoutTrendData[];
}

export default function DropoutTrendChart({ data }: DropoutTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center">
        <p className="text-gray-500">No dropout trend data</p>
      </div>
    );
  }

  const maxDropouts = Math.max(...data.map((d) => d.dropouts));
  const targetThreshold = Math.ceil(maxDropouts * 0.5);

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="dropoutsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-dropouts)"
              stopOpacity={0.8}
            />
            <stop
              offset="95%"
              stopColor="var(--color-dropouts)"
              stopOpacity={0.1}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e5e7eb" />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={false}
          style={{ fontSize: "12px" }}
        />
        <YAxis tickLine={false} axisLine={false} style={{ fontSize: "12px" }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {targetThreshold > 0 && (
          <ReferenceLine
            y={targetThreshold}
            stroke="#eab308"
            strokeDasharray="3 3"
            label={{
              value: `Target: ${targetThreshold}`,
              position: "right",
              fill: "#eab308",
              fontSize: 12,
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="dropouts"
          stroke="var(--color-dropouts)"
          strokeWidth={2}
          fill="url(#dropoutsGradient)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
