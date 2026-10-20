"use client";

import { useState } from "react";
import { Spinner, Alert } from "@nemis-desktop/ui";
import type { CountyFeeRulesQuery, CountyOwnership } from "@nemis-desktop/types";
import { Building2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/components/finance/shared";
import { LEVEL_LABELS, OWNERSHIP_LABELS } from "@/components/county/finance/finance-display";
import { useCountyFeeRulesViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";

const PAGE_SIZE = 10;

/** Port of portal-web government/county/finance/fee-rules/page.tsx, read
 * from this device; inactive rules are listed too, after the active ones. */
export default function CountyFeeRulesPage() {
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState("");
  const [page, setPage] = useState(1);

  const vm = useCountyFeeRulesViewModel();
  const rulesState = useViewModel(vm.store, (s) => s.rules);

  useRevalidateOnSync(() => {
    const query: CountyFeeRulesQuery = { page, limit: PAGE_SIZE };
    if (search) query.search = search;
    if (ownership) query.ownership = ownership as CountyOwnership;
    void vm.load(query);
  }, [search, ownership, page]);

  const data = rulesState.status === "success" || rulesState.status === "refreshing" ? rulesState.data : undefined;
  const isLoading = rulesState.status === "idle" || rulesState.status === "loading";
  const schools = data?.schools ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleOwnership = (value: string) => {
    setOwnership(value);
    setPage(1);
  };

  if (rulesState.status === "error") return <Alert variant="error">Failed to load fee rules.</Alert>;

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      {/* Header Band */}
      <div className="bg-slate-900 text-white px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
          County Education Office
        </p>
        <h1 className="text-xl font-bold text-white">Fee Rules</h1>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by school name…"
              className="w-full pl-9 pr-4 py-2 rounded-button border border-slate-200 bg-white focus:ring-1 focus:ring-secondary text-sm outline-none"
            />
          </div>
          <select
            value={ownership}
            onChange={(e) => handleOwnership(e.target.value)}
            className="pl-4 pr-9 py-2  rounded-button border border-slate-200 bg-white focus:ring-1 focus:ring-secondary text-sm outline-none appearance-none shrink-0"
          >
            <option value="">All School Types</option>
            {Object.entries(OWNERSHIP_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {/* Summary */}
        {!isLoading && (
          <p className="text-xs text-slate-400">
            {total === 0
              ? "No schools have set fee rules yet."
              : `${total} school${total !== 1 ? "s" : ""} with fee rules`}
          </p>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner size="lg" />
          </div>
        ) : schools.length === 0 ? (
          <div className="bg-white border border-slate-300 p-12 text-center">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-200" />
            <p className="text-slate-400 text-sm">
              {search || ownership ? "No schools match your filters." : "No schools have set fee rules yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {schools.map((school) => (
              <div key={school.id} className="bg-white rounded-lg border border-slate-300 overflow-hidden">
                {/* School header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="font-bold text-slate-700 text-sm">{school.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5">
                          {OWNERSHIP_LABELS[school.ownership] ?? school.ownership}
                        </span>
                        {school.district && <span className="text-xs text-slate-400">{school.district.name}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {school.ownFeeRules.length} rule
                    {school.ownFeeRules.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Rules table */}
                <table className="w-full text-sm">
                  <thead className="bg-secondary/20 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Rule Name
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Category
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Amount
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Levels
                      </th>
                      <th className="text-center px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {school.ownFeeRules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-xs text-slate-600">{rule.name}</p>
                          {rule.description && <p className="text-xs text-slate-400 mt-0.5">{rule.description}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5">
                            {rule.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs  font-semibold text-slate-800">
                          {formatCurrency(rule.amount, rule.currency)}
                        </td>
                        <td className="px-4 py-3">
                          {rule.applicableLevels.length === 0 ? (
                            <span className="text-xs text-slate-400">All Levels</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {rule.applicableLevels.slice(0, 4).map((l) => (
                                <span key={l} className="text-xs bg-slate-100 font-semibold text-slate-600 px-1.5 py-0.5">
                                  {LEVEL_LABELS[l] ?? l}
                                </span>
                              ))}
                              {rule.applicableLevels.length > 4 && (
                                <span className="text-xs text-slate-400">+{rule.applicableLevels.length - 4}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-xs rounded-button font-semibold px-2 py-0.5 ${
                              rule.isActive ? "text-slate-100 bg-active" : "text-slate-400 bg-slate-100"
                            }`}
                          >
                            {rule.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between bg-white border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-400">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Previous page"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-600 font-medium">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    aria-label="Next page"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages}
                    className="p-1.5 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
