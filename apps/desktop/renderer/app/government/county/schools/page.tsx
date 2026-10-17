"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Spinner, Card, ErrorState } from "@nemis-desktop/ui";
import { useRouter } from "next/navigation";
import {
  Search,
  School,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
} from "lucide-react";
import { useCountySchoolsViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { SchoolPhoto } from "@/components/county/schools/SchoolPhoto";
import { SchoolRegistrationBadge } from "@/components/county/schools/registration/SchoolRegistrationBadge";

const ITEMS_PER_PAGE = 10;

export default function SchoolsPage() {
  const router = useRouter();
  const vm = useCountySchoolsViewModel();
  const summary = useViewModel(vm.store, (s) => s.summary);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [currentPage, setCurrentPage] = useState(1);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  // `refreshing` keeps the page on screen during a reload.
  const data =
    summary.status === "success" || summary.status === "refreshing" ? summary.data : null;
  const county = data?.county ?? null;
  const districtCount = data?.districtCount ?? 0;
  const schools = useMemo(() => data?.schools ?? [], [data]);

  const filteredSchools = useMemo(() => {
    return schools.filter((school) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        school.name.toLowerCase().includes(term) ||
        school.code.toLowerCase().includes(term) ||
        (school.district?.name || "").toLowerCase().includes(term);
      const matchesType =
        selectedType === "all" ||
        school.levels?.some((l) => l.level === selectedType);
      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active" && school.isActive) ||
        (selectedStatus === "inactive" && !school.isActive);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [schools, searchTerm, selectedType, selectedStatus]);

  const totalPages = Math.ceil(filteredSchools.length / ITEMS_PER_PAGE);
  const paginatedSchools = filteredSchools.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const totalEnrollment = schools.reduce(
    (sum, s) => sum + (s._count?.students || 0),
    0,
  );
  const activeSchools = schools.filter((s) => s.isActive).length;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedType, selectedStatus]);

  if (summary.status === "idle" || summary.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (summary.status === "error") {
    return (
      <div className="p-8">
        <ErrorState message={summary.error.userMessage} onRetry={() => void vm.load()} />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        {/* Header Band */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
              {county?.name || "County"}
            </p>
            <h1 className="text-xl font-bold text-white">Schools</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                router.push("/government/county/schools/bulk-import")
              }
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-button border border-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Bulk Import
            </button>
            <button
              onClick={() => router.push("/government/county/schools/create")}
              className="flex items-center gap-2 px-3 py-2 rounded-button bg-slate-600 text-white text-xs font-medium  hover:bg-sky-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add School
            </button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Schools
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {schools.length}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Registered county-wide
              </p>
            </Card>

            <Link href="/government/county/students">
              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Total Enrollment
                </p>
                <p className="text-4xl font-bold text-slate-900 mt-2">
                  {totalEnrollment.toLocaleString()}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Students across all schools
                </p>
              </Card>
            </Link>

            <Link href="/government/county/districts">
              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Districts
                </p>
                <p className="text-4xl font-bold text-slate-900 mt-2">
                  {districtCount}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Administrative units
                </p>
              </Card>
            </Link>

            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Active Schools
              </p>
              <p className="text-4xl font-bold text-emerald-600 mt-2">
                {activeSchools}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {schools.length - activeSchools} inactive
              </p>
            </Card>
          </div>

          {/* Sidebar + content */}
          <div className="flex flex-col lg:flex-row  gap-4">
            {/* Filter sidebar */}
            <div className="w-full lg:w-56 shrink-0">
              <div className="sticky top-12  bg-white border border-slate-300 p-5 space-y-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Search className="w-3.5 h-3.5" /> Filters
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
                      placeholder="Name, code, district…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200  focus:ring-2 focus:ring-secondary/50  outline-none text-slate-700 placeholder:text-slate-300"
                    />
                  </div>
                </div>

                {/* School Type */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    School Type
                  </label>
                  <div className="space-y-1">
                    {[
                      { value: "all", label: "All" },
                      { value: "PRIMARY", label: "Primary" },
                      { value: "SECONDARY", label: "Secondary" },
                      { value: "CERTIFICATE", label: "Technical" },
                      { value: "PRE_PRIMARY", label: "Pre-Primary" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedType(opt.value)}
                        className={`w-full text-left px-3 py-1.5 text-sm  transition-colors ${
                          selectedType === opt.value
                            ? "bg-secondary text-white font-medium"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Status
                  </label>
                  <div className="space-y-1">
                    {[
                      { value: "all", label: "All" },
                      { value: "active", label: "Active" },
                      { value: "inactive", label: "Inactive" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedStatus(opt.value)}
                        className={`w-full text-left px-3 py-1.5 text-sm  transition-colors ${
                          selectedStatus === opt.value
                            ? "bg-secondary text-white font-medium"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-800">
                    {filteredSchools.length}
                  </span>{" "}
                  schools found
                </p>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5  transition-colors ${
                      viewMode === "grid"
                        ? "bg-slate-900 text-white"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`p-1.5  transition-colors ${
                      viewMode === "table"
                        ? "bg-slate-900 text-white"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Empty state */}
              {filteredSchools.length === 0 ? (
                <div className="bg-white border border-slate-300p-12 text-center">
                  <School className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">
                    No schools found matching your criteria.
                  </p>
                </div>
              ) : viewMode === "grid" ? (
                /* Grid View */
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4 gap-4">
                  {paginatedSchools.map((school) => (
                    <div
                      key={school.id}
                      className="bg-white border rounded-lg border-slate-300 hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-col items-start gap-4">
                        <div className="relative w-full h-40 rounded-lg aspect-square overflow-hidden shrink-0 bg-slate-100">
                          <SchoolPhoto
                            src={school.photoUrl || "/school-fallback.jpg"}
                            alt={school.name}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                            quality={100}
                            className="object-cover"
                          />
                        </div>
                        <div className=" w-full px-4 pb-4 flex-1 ">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {school.name}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {school.code}
                          </p>
                          <div className="mt-1">
                            <SchoolRegistrationBadge syncState={school.syncState} syncError={school.syncError} />
                          </div>

                          <div className="flex items-center  justify-between mt-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                                District
                              </p>
                              <p className="text-sm font-semibold text-slate-700 mt-0.5">
                                {school.district?.name || "N/A"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                                Enrolled
                              </p>
                              <p className="text-sm font-semibold text-slate-700 mt-0.5">
                                {(
                                  school._count?.students || 0
                                ).toLocaleString()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                            <span
                              className={`text-xs font-semibold rounded-full px-2 py-0.5  ${
                                school.isActive
                                  ? "text-slate-100 bg-active"
                                  : "text-slate-400 bg-slate-100"
                              }`}
                            >
                              {school.isActive ? "Active" : "Inactive"}
                            </span>
                            <button
                              onClick={() =>
                                router.push(
                                  `/government/county/schools/details?id=${school.id}`,
                                )
                              }
                              className="text-xs bg-secondary/80 rounded-button px-4 py-1 font-semibold text-slate-100 hover:bg-secondary  transition-colors"
                            >
                              View School &rarr;
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Table View */
                <div className="bg-white border rounded-lg border-slate-300 overflow-hidden">
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
                          Enrolled
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Status
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedSchools.map((school) => (
                        <tr key={school.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 shrink-0">
                                <SchoolPhoto
                                  src={
                                    school.photoUrl || "/school-fallback.jpg"
                                  }
                                  alt={school.name}
                                  width={32}
                                  height={32}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <span className="font-medium text-slate-800 max-w-[150px] truncate">
                                {school.name}
                              </span>
                              <SchoolRegistrationBadge syncState={school.syncState} syncError={school.syncError} />
                            </div>
                          </td>
                          
                          <td className="px-4 py-3 text-slate-500 truncate-10">
                            {school.district?.name || "—"}
                          </td>

                          <td className="px-4 py-3  text-slate-600 text-center">
                            {(school._count?.students || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                school.isActive
                                  ? "text-emerald-700 bg-emerald-50"
                                  : "text-slate-400 bg-slate-100"
                              }`}
                            >
                              {school.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() =>
                                router.push(
                                  `/government/county/schools/details?id=${school.id}`,
                                )
                              }
                              className="text-xs font-semibold text-sky-700 hover:text-sky-900 transition-colors"
                            >
                              View &rarr;
                            </button>
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
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 5) page = i + 1;
                      else if (currentPage <= 3) page = i + 1;
                      else if (currentPage >= totalPages - 2)
                        page = totalPages - 4 + i;
                      else page = currentPage - 2 + i;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                            currentPage === page
                              ? "bg-slate-900 text-white"
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <button
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
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
    </>
  );
}
