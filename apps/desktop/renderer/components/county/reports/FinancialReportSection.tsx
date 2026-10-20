"use client";

import type { CountyFinanceDashboard, CountySchoolFinanceRow } from "@nemis-desktop/types";
import { AlertTriangle, Building2, ClipboardCheck, DollarSign, FileText, TrendingUp, Users } from "lucide-react";
import { rateStatus, type RateStatus } from "@/components/county/finance/finance-display";
import { CollectionByDistrictChart, PaymentStatusChart } from "./ReportCharts";
import { DistrictDivider, SummaryCard, groupByDistrict } from "./report-display";

/** The County Finance rate rule (70/40), as on the Finance page. */
const RATE_BADGE: Record<RateStatus, string> = {
  "on-track": "bg-active",
  "at-risk": "bg-pending",
  below: "bg-error",
};

const HEADERS = ["School", "Expected", "Collected", "Outstanding", "Rate", "Students", "Paid", "Partial", "Unpaid"];

/** Port of portal-web's FinancialReportSection, fed from the County Finance
 * figures (current academic year) the page already loads. */
export function FinancialReportSection({
  dashboard,
  schools,
}: {
  dashboard: CountyFinanceDashboard;
  schools: CountySchoolFinanceRow[];
}) {
  const currency = dashboard.currency || "LRD";
  const fmt = (n: number) =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const groups = groupByDistrict(schools).sort((a, b) => a.districtName.localeCompare(b.districtName));

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        <SummaryCard label="Total Expected" value={fmt(dashboard.totalExpected)} icon={DollarSign} valueColor="text-slate-900" />
        <SummaryCard label="Total Collected" value={fmt(dashboard.totalCollected)} icon={TrendingUp} valueColor="text-secondary" />
        <SummaryCard label="Total Outstanding" value={fmt(dashboard.totalOutstanding)} icon={AlertTriangle} valueColor="text-error" />
        <SummaryCard label="Total Schools" value={dashboard.totalSchools} icon={Building2} valueColor="text-slate-900" />
        <SummaryCard label="Schools Reporting" value={dashboard.schoolsReporting} icon={FileText} valueColor="text-slate-900" />
        <SummaryCard label="Students Paid" value={dashboard.studentsPaid} icon={Users} valueColor="text-active" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-300 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Student Payment Status</p>
          <PaymentStatusChart paid={dashboard.studentsPaid} partial={dashboard.studentsPartial} unpaid={dashboard.studentsUnpaid} />
        </div>
        <div className="bg-white border border-slate-300 p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Collection by District</p>
          <CollectionByDistrictChart data={dashboard.districtComparison} currency={currency} />
        </div>
      </div>

      {/* Per-district school tables */}
      {groups.map((group) => {
        const groupExpected = group.schools.reduce((s, x) => s + x.totalExpected, 0);
        const groupCollected = group.schools.reduce((s, x) => s + x.totalCollected, 0);
        const groupRate = groupExpected > 0 ? Math.round((groupCollected / groupExpected) * 100) : 0;

        return (
          <div key={group.districtId} className="space-y-3">
            <DistrictDivider name={group.districtName} />

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <SummaryCard label="Expected" value={fmt(groupExpected)} icon={DollarSign} valueColor="text-slate-900" />
              <SummaryCard label="Collected" value={fmt(groupCollected)} icon={TrendingUp} valueColor="text-active" />
              <SummaryCard label="Collection Rate" value={groupRate} icon={ClipboardCheck} valueColor="text-secondary" suffix="%" />
            </div>

            <div className="bg-white border border-slate-300 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary-50 border-b border-slate-100">
                    <tr>
                      {HEADERS.map((h, i) => (
                        <th
                          key={h}
                          className={`px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400 ${i === 0 ? "text-left" : "text-right"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.schools
                      .slice()
                      .sort((a, b) => b.collectionRate - a.collectionRate)
                      .map((s) => (
                        <tr key={s.institutionId} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{s.institutionName}</td>
                          <td className="px-4 py-3 text-right text-slate-600 text-xs">{fmt(s.totalExpected)}</td>
                          <td className="px-4 py-3 text-right text-active text-xs">{fmt(s.totalCollected)}</td>
                          <td className="px-4 py-3 text-right text-error text-xs">{fmt(s.totalOutstanding)}</td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 text-slate-100 ${RATE_BADGE[rateStatus(s.collectionRate)]}`}
                            >
                              {s.collectionRate}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{s.studentCount}</td>
                          <td className="px-4 py-3 text-right text-active">{s.paidCount}</td>
                          <td className="px-4 py-3 text-right text-pending">{s.partialCount}</td>
                          <td className="px-4 py-3 text-right text-error">{s.unpaidCount}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
