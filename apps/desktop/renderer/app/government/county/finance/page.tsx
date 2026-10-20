"use client";

import { useState } from "react";
import { Spinner, Alert, Card } from "@nemis-desktop/ui";
import { formatNemisId } from "@nemis-desktop/shared";
import type { CountyFeeCollectionsQuery, CountyOwnership } from "@nemis-desktop/types";
import { AlertTriangle, Search, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/components/finance/shared";
import {
  METHOD_LABELS,
  OWNERSHIP_LABELS,
  academicYearLabel,
  districtOptions as toDistrictOptions,
  formatDate,
  rateBarColor,
  rateColor,
  rateStatus,
} from "@/components/county/finance/finance-display";
import { useCountyFinanceViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";

type Tab = "overview" | "schools" | "payments";

const PAGE_SIZE = 50;

/** Port of portal-web government/county/finance/page.tsx, read from this
 * device; figures cover each school's current academic year. */
export default function CountyFinancePage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentDistrict, setPaymentDistrict] = useState("");
  const [paymentOwnership, setPaymentOwnership] = useState("");
  const [paymentPage, setPaymentPage] = useState(1);

  const vm = useCountyFinanceViewModel();
  const dashboardState = useViewModel(vm.store, (s) => s.dashboard);
  const schoolsState = useViewModel(vm.store, (s) => s.schools);
  const paymentsState = useViewModel(vm.store, (s) => s.payments);

  useRevalidateOnSync(() => {
    void vm.loadDashboard();
  }, []);
  // Each tab loads when opened, as the web skips its queries until then.
  useRevalidateOnSync(() => {
    if (activeTab === "schools") void vm.loadSchools();
  }, [activeTab]);
  useRevalidateOnSync(() => {
    if (activeTab !== "payments") return;
    const query: CountyFeeCollectionsQuery = { page: paymentPage, limit: PAGE_SIZE };
    if (paymentSearch) query.search = paymentSearch;
    if (paymentDistrict) query.districtId = paymentDistrict;
    if (paymentOwnership) query.ownership = paymentOwnership as CountyOwnership;
    void vm.loadPayments(query);
  }, [activeTab, paymentSearch, paymentDistrict, paymentOwnership, paymentPage]);

  const dashboard =
    dashboardState.status === "success" || dashboardState.status === "refreshing" ? dashboardState.data : undefined;
  const schools =
    schoolsState.status === "success" || schoolsState.status === "refreshing" ? schoolsState.data : [];
  const schoolsLoading = schoolsState.status === "idle" || schoolsState.status === "loading";
  const paymentsData =
    paymentsState.status === "success" || paymentsState.status === "refreshing" ? paymentsState.data : undefined;
  const paymentsLoading = paymentsState.status === "idle" || paymentsState.status === "loading";

  // From the always-loaded dashboard, so the filter is there before the
  // All Schools tab is ever opened.
  const districtOptions = toDistrictOptions(dashboard?.districtComparison ?? []);
  const countyName = dashboard?.county?.name ?? "County";

  if (dashboardState.status === "idle" || dashboardState.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (dashboardState.status === "error") {
    return <Alert variant="error">Failed to load finance data. Please try again.</Alert>;
  }

  const districts = dashboard
    ? [...dashboard.districtComparison].sort((a, b) => b.collectionRate - a.collectionRate)
    : [];

  const schoolsSorted = [...schools].sort((a, b) => a.collectionRate - b.collectionRate);

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      {/* Header Band */}
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            Finance Monitoring
          </p>
          <h1 className="text-xl font-bold text-white">{countyName}</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase tracking-widest">Academic Year</p>
          <p className="text-sm font-semibold text-slate-200 mt-0.5">
            {academicYearLabel(dashboard?.academicYearName ?? null)}
          </p>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        {dashboard && (
          <>
            {/* Row 1: Primary metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Total Collected</p>
                <p className="text-2xl  font-bold text-slate-700 mt-2 break-all">
                  {formatCurrency(dashboard.totalCollected, "LRD")}
                </p>
              </Card>

              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Collection Rate</p>
                <p className={`text-2xl font-bold mt-2 ${rateColor(dashboard.collectionRate)}`}>
                  {dashboard.collectionRate}%
                </p>
                <div className="mt-3 h-1.5 bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full ${rateBarColor(dashboard.collectionRate)}`}
                    style={{ width: `${Math.min(dashboard.collectionRate, 100)}%` }}
                  />
                </div>
              </Card>

              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Schools Reporting</p>
                <p className="text-2xl font-bold text-slate-700 mt-2">
                  {dashboard.schoolsReporting}
                  <span className="text-xl text-slate-400 font-medium">/{dashboard.totalSchools}</span>
                </p>
                <div className="mt-3 h-1.5 bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-slate-700"
                    style={{
                      width: `${
                        dashboard.totalSchools > 0 ? (dashboard.schoolsReporting / dashboard.totalSchools) * 100 : 0
                      }%`,
                    }}
                  />
                </div>
              </Card>
            </div>

            {/* Row 2: Student payment status */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Paid in Full</p>
                <p className="text-2xl font-bold text-active mt-1">{dashboard.studentsPaid.toLocaleString()}</p>
              </Card>
              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Partially Paid</p>
                <p className="text-2xl font-bold text-pending mt-1">{dashboard.studentsPartial.toLocaleString()}</p>
              </Card>
              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">No Payment Yet</p>
                <p className="text-2xl font-bold text-error mt-1">{dashboard.studentsUnpaid.toLocaleString()}</p>
              </Card>
            </div>
          </>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-slate-200">
          <div className="flex gap-6">
            {(
              [
                { id: "overview", label: "Overview" },
                { id: "schools", label: "All Schools" },
                { id: "payments", label: "Payments" },
              ] as { id: Tab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "text-slate-900 border-b-2 border-slate-900"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab — District Performance */}
        {activeTab === "overview" && (
          <div className="space-y-3">
            {districts.length === 0 ? (
              <div className="bg-white border border-slate-300 p-10 text-center text-slate-400">
                No district financial data available yet.
              </div>
            ) : (
              districts.map((d) => (
                <div key={d.districtId} className="bg-white border rounded-lg border-slate-300 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      {d.districtName}
                    </span>
                    <div className="flex items-center gap-2">
                      {rateStatus(d.collectionRate) === "below" && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-100 bg-error px-2 py-0.5">
                          <AlertTriangle className="w-3 h-3" /> Below Target
                        </span>
                      )}
                      <span className={`text-lg font-bold ${rateColor(d.collectionRate)}`}>{d.collectionRate}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${rateBarColor(d.collectionRate)}`}
                      style={{ width: `${Math.min(d.collectionRate, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400">{formatCurrency(d.totalCollected, "LRD")} collected</span>
                    <span className="text-xs text-slate-400">
                      {d.schoolCount} school{d.schoolCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* All Schools Tab */}
        {activeTab === "schools" &&
          (schoolsState.status === "error" ? (
            <Alert variant="error">Failed to load school finance data. Please try again.</Alert>
          ) : schoolsLoading ? (
            <div className="flex justify-center p-12">
              <Spinner />
            </div>
          ) : (
            <div className="bg-white border border-slate-300 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/20 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                      School
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                      District
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Collected
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Rate
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schoolsSorted.map((s) => (
                    <tr key={s.institutionId} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-600 ">{s.institutionName}</p>
                        <p className="text-xs text-slate-400">{s.institutionCode}</p>
                      </td>
                      <td className="font-semibold px-4 py-3 text-slate-600">{s.districtName ?? "—"}</td>
                      <td className="font-semibold px-4 py-3 text-right text-slate-600">
                        {formatCurrency(s.totalCollected, "LRD")}
                      </td>
                      <td className={`font-semibold px-4 py-3 text-right ${rateColor(s.collectionRate)}`}>
                        {s.collectionRate}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        {rateStatus(s.collectionRate) === "below" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-100 bg-error px-2 py-0.5">
                            <AlertTriangle className="w-3 h-3" /> Below Target
                          </span>
                        ) : rateStatus(s.collectionRate) === "on-track" ? (
                          <span className="text-xs font-semibold rounded-full text-slate-100 bg-active px-2 py-0.5">
                            On Track
                          </span>
                        ) : (
                          <span className="text-xs font-semibold rounded-full text-slate-100 bg-pending px-2 py-0.5">
                            At Risk
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {schoolsSorted.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                        No school financial data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}

        {/* Payments Tab */}
        {activeTab === "payments" && (
          <div className="space-y-5">
            {/* Summary cards */}
            {paymentsData && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg border border-slate-300 p-5 text-center min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Total Collected</p>
                  <p className="text-2xl font-bold text-slate-700 mt-1 break-all">
                    {formatCurrency(paymentsData.summary.totalCollected, "LRD")}
                  </p>
                </div>
                <div className="bg-white border rounded-lg border-slate-300 p-5 text-center">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Transactions</p>
                  <p className="text-2xl font-bold text-slate-700 mt-1">
                    {paymentsData.summary.totalTransactions.toLocaleString()}
                  </p>
                </div>
                <div className="bg-white rounded-lg border border-slate-300 p-5 text-center">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Schools Reporting</p>
                  <p className="text-2xl font-bold text-slate-700 mt-1">{paymentsData.summary.schoolsWithPayments}</p>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  value={paymentSearch}
                  onChange={(e) => {
                    setPaymentSearch(e.target.value);
                    setPaymentPage(1);
                  }}
                  placeholder="Search by student name, NEMIS ID, or school…"
                  className="w-full pl-9 pr-4 py-2  rounded-button border border-slate-200 bg-white focus:ring-1 focus:ring-secondary text-sm outline-none"
                />
              </div>
              <div className="relative shrink-0">
                <select
                  value={paymentOwnership}
                  onChange={(e) => {
                    setPaymentOwnership(e.target.value);
                    setPaymentPage(1);
                  }}
                  className="appearance-none rounded-button pl-4 pr-9 py-2 border border-slate-200 bg-white focus:ring-1 focus:ring-secondary text-sm outline-none"
                >
                  <option value="">All School Types</option>
                  {Object.entries(OWNERSHIP_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              {districtOptions.length > 0 && (
                <div className="relative shrink-0">
                  <select
                    value={paymentDistrict}
                    onChange={(e) => {
                      setPaymentDistrict(e.target.value);
                      setPaymentPage(1);
                    }}
                    className="appearance-none rounded-button pl-4 pr-9 py-2 border border-slate-200 bg-white focus:ring-1 focus:ring-secondary text-sm outline-none"
                  >
                    <option value="">All Districts</option>
                    {districtOptions.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              )}
            </div>

            {/* Records table */}
            {paymentsState.status === "error" ? (
              <Alert variant="error">Failed to load payments. Please try again.</Alert>
            ) : paymentsLoading ? (
              <div className="flex justify-center p-12">
                <Spinner />
              </div>
            ) : (
              <div className="bg-white border rounded-lg border-slate-300 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/25 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Student
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        School
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Fee Rule
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Amount
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Method
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(paymentsData?.records ?? []).map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{p.studentName}</p>
                          <p className="text-xs text-slate-400">{p.nemisId ? formatNemisId(p.nemisId) : "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700">{p.schoolName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5">
                              {OWNERSHIP_LABELS[p.schoolOwnership] ?? p.schoolOwnership}
                            </span>
                            {p.districtName && <span className="text-[10px] text-slate-400">{p.districtName}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{p.feeRuleName}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          {formatCurrency(p.amountPaid, "LRD")}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5">
                            {METHOD_LABELS[p.method] ?? p.method}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(p.paidAt)}</td>
                      </tr>
                    ))}
                    {(paymentsData?.records ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                          {paymentSearch || paymentOwnership || paymentDistrict
                            ? "No payments match your filters."
                            : "No payment records yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Pagination */}
                {paymentsData && paymentsData.total > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                      Showing {(paymentPage - 1) * PAGE_SIZE + 1}–{Math.min(paymentPage * PAGE_SIZE, paymentsData.total)}{" "}
                      of {paymentsData.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        aria-label="Previous page"
                        onClick={() => setPaymentPage((p) => Math.max(1, p - 1))}
                        disabled={paymentPage === 1}
                        className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-slate-600 font-medium">
                        Page {paymentPage} of {Math.ceil(paymentsData.total / PAGE_SIZE)}
                      </span>
                      <button
                        aria-label="Next page"
                        onClick={() => setPaymentPage((p) => p + 1)}
                        disabled={paymentPage * PAGE_SIZE >= paymentsData.total}
                        className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
