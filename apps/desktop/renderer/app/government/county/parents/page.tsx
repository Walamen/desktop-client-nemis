"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner, Avatar, Card } from "@nemis-desktop/ui";
import type { CountyGuardiansQuery } from "@nemis-desktop/types";
import { useCountyGuardiansViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { ParentCard } from "@/components/county/parents/ParentCard";
import {
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Phone,
  Mail,
} from "lucide-react";

const RELATIONSHIP_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Father", label: "Father" },
  { value: "Mother", label: "Mother" },
  { value: "Guardian", label: "Guardian" },
  { value: "Grandparent", label: "Grandparent" },
  { value: "Uncle", label: "Uncle" },
  { value: "Aunt", label: "Aunt" },
  { value: "Sibling", label: "Sibling" },
  { value: "Other", label: "Other" },
];

const PAGE_SIZE = 12;

const profileHref = (id: string) => `/government/county/parents/details?id=${encodeURIComponent(id)}`;

/** Port of portal-web county/parents (docs/superpowers/specs/2026-10-18-county-parents-design.md §2.1).
 * The web filters one full list in the browser; here the device filters and
 * pages locally with the same results. */
export default function CountyParentsPage() {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedRelationship, setSelectedRelationship] = useState("all");
  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedRelationship, selectedDistrict]);

  const vm = useCountyGuardiansViewModel();
  const summary = useViewModel(vm.store, (s) => s.summary);
  const query: CountyGuardiansQuery = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(selectedRelationship !== "all" ? { relationship: selectedRelationship } : {}),
    ...(selectedDistrict !== "all" ? { districtId: selectedDistrict } : {}),
    page: currentPage,
    limit: PAGE_SIZE,
  };
  useRevalidateOnSync(() => {
    void vm.load(query);
  }, [vm, JSON.stringify(query)]);

  const result =
    summary.status === "success" || summary.status === "refreshing" ? summary.data : null;
  const county = result?.county ?? null;
  const districts = result?.districts ?? [];
  const paginated = result?.data ?? [];
  const filteredCount = result?.total ?? 0;
  const totalPages = result?.totalPages || 1;

  const totalCount = result?.stats.total ?? 0;
  const totalChildrenCovered = result?.stats.childrenCovered ?? 0;
  const primaryCount = result?.stats.primaryGuardians ?? 0;

  // Only the very first load shows the spinner; refreshes keep the page.
  if (summary.status === "idle" || summary.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      {/* Header Band */}
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            {county?.name || "County"}
          </p>
          <h1 className="text-xl font-bold text-white">Parents &amp; Guardians</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase tracking-widest">Total</p>
          <p className="text-sm font-semibold text-slate-200 mt-0.5">{totalCount.toLocaleString()}</p>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Total Parents / Guardians
            </p>
            <p className="text-4xl font-bold text-slate-900 mt-2">{totalCount.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">Registered in county</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Children Covered</p>
            <p className="text-4xl font-bold text-active mt-2">{totalChildrenCovered.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">Active student links</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Primary Guardians</p>
            <p className="text-4xl font-bold text-slate-900 mt-2">{primaryCount.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">Designated as primary contact</p>
          </Card>
        </div>

        {/* Sidebar + content */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Filter Sidebar */}
          <div className="w-full lg:w-56 shrink-0 sticky self-start top-6">
            <div className="bg-white border border-slate-300 p-5 space-y-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
              </p>

              {/* Search */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Name, email, phone…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 focus:ring-1 focus:ring-secondary outline-none text-slate-700 placeholder:text-slate-300"
                  />
                </div>
              </div>

              {/* Relationship */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Relationship
                </label>
                <div className="space-y-1">
                  {RELATIONSHIP_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedRelationship(opt.value)}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                        selectedRelationship === opt.value
                          ? "bg-secondary text-white font-medium"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* District */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  District
                </label>
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 focus:ring-1 focus:ring-secondary outline-none text-slate-700"
                >
                  <option value="all">All Districts</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-800">{filteredCount}</span> parents found
              </p>
              <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5">
                <button
                  aria-label="Card view"
                  onClick={() => setViewMode("cards")}
                  className={`p-1.5 transition-colors ${
                    viewMode === "cards" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  aria-label="Table view"
                  onClick={() => setViewMode("table")}
                  className={`p-1.5 transition-colors ${
                    viewMode === "table" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Empty state */}
            {paginated.length === 0 ? (
              <div className="bg-white border border-slate-300 p-12 text-center">
                <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No parents found matching your criteria.</p>
              </div>
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4 gap-4">
                {paginated.map((guardian) => (
                  <ParentCard key={guardian.id} guardian={guardian} />
                ))}
              </div>
            ) : (
              <div className="bg-white border border-slate-300 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/20 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Parent
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Relationship
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Contact
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Children
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        District
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginated.map((guardian) => (
                      <tr
                        key={guardian.id}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => router.push(profileHref(guardian.id))}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar
                              src={guardian.photoUrl}
                              firstName={guardian.firstName}
                              lastName={guardian.lastName}
                              role="parent"
                              size="sm"
                            />
                            <span className="font-medium text-slate-800">
                              {guardian.firstName} {guardian.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600">
                            {guardian.relationship || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {guardian.phoneNumber && (
                              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {guardian.phoneNumber}
                              </p>
                            )}
                            {guardian.email && (
                              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {guardian.email}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold text-slate-800">{guardian.studentsCount}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {guardian.districts.join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-slate-400">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="Previous page"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 7) page = i + 1;
                    else if (currentPage <= 4) page = i + 1;
                    else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
                    else page = currentPage - 3 + i;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                          currentPage === page ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    aria-label="Next page"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
