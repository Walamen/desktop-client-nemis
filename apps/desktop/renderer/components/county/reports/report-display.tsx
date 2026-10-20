"use client";

import type { ComponentType, ReactNode } from "react";
import { Card } from "@nemis-desktop/ui";
import { MapPin } from "lucide-react";

/** Shared pieces of portal-web's Generate Reports page. */
interface SummaryCardProps {
  label: string;
  value: number | string;
  icon: ComponentType<{ className?: string }>;
  valueColor: string;
  suffix?: string;
}

export function SummaryCard({ label, value, icon: Icon, valueColor, suffix }: SummaryCardProps) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <div className="w-7 h-7 bg-slate-100 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 leading-tight truncate min-w-0">
          {label}
        </p>
      </div>
      <p className={`text-2xl font-bold truncate ${valueColor}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
        {suffix && <span className="text-sm font-normal text-slate-400 ml-1">{suffix}</span>}
      </p>
    </Card>
  );
}

interface ReportTableProps {
  title: string;
  headers: string[];
  alignments: ("left" | "right" | "center")[];
  children: ReactNode;
}

const ALIGN: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function ReportTable({ title, headers, alignments, children }: ReportTableProps) {
  return (
    <div className="bg-white border border-slate-300 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {headers.map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400 ${ALIGN[alignments[i] ?? "left"]}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

/** The ── MAP-PIN DISTRICT ── divider between per-district sections. */
export function DistrictDivider({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="flex-1 h-px bg-slate-300" />
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500 px-2 flex items-center gap-1.5">
        <MapPin className="w-3 h-3" /> {name}
      </span>
      <div className="flex-1 h-px bg-slate-300" />
    </div>
  );
}

/** Rows grouped by district in first-seen order; no district → "Unknown District". */
export function groupByDistrict<T extends { districtId?: string | null; districtName?: string | null }>(
  items: T[],
): Array<{ districtId: string; districtName: string; schools: T[] }> {
  const map = new Map<string, { districtId: string; districtName: string; schools: T[] }>();
  for (const item of items) {
    const key = item.districtId || "unknown";
    const group = map.get(key) ?? { districtId: key, districtName: item.districtName || "Unknown District", schools: [] };
    group.schools.push(item);
    map.set(key, group);
  }
  return Array.from(map.values());
}
