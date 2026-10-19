"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner, Avatar, Card } from "@nemis-desktop/ui";
import type { CountyTeacherListItem as CountyTeacher, CountyTeachersQuery } from "@nemis-desktop/types";
import { useCountyTeachersViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { SchoolPhoto } from "@/components/county/schools/SchoolPhoto";
import {
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  LayoutGrid,
  List,
  ArrowRight,
} from "lucide-react";

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "PRIMARY", label: "Primary" },
  { value: "SECONDARY", label: "Secondary" },
  { value: "CERTIFICATE", label: "Technical" },
  { value: "DIPLOMA", label: "Vocational" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const profileHref = (id: string) => `/government/county/teachers/details?id=${encodeURIComponent(id)}`;

function formatLevel(level: string | null) {
  if (!level) return "";
  return level.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CountyTeachersPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [currentPage, setCurrentPage] = useState(1);

  // One local read replaces the web's three queries (county, stats, the page).
  const vm = useCountyTeachersViewModel();
  const summary = useViewModel(vm.store, (s) => s.summary);
  const query: CountyTeachersQuery = {
    search: searchTerm || undefined,
    category: selectedCategory !== "all" ? selectedCategory : undefined,
    subject: selectedSubject !== "all" ? selectedSubject : undefined,
    status: selectedStatus === "active" || selectedStatus === "inactive" ? selectedStatus : undefined,
    page: currentPage,
    limit: 12,
  };
  const reload = () => {
    void vm.load(query);
  };
  useRevalidateOnSync(reload, [vm, JSON.stringify(query)]);

  const result =
    summary.status === "success" || summary.status === "refreshing" ? summary.data : null;
  const loadError = summary.status === "error" ? summary.error.userMessage : null;
  const county = result?.county ?? null;
  const teachers = result?.data ?? [];
  const totalTeachers = result?.total || 0;
  const totalPages = result?.totalPages || 1;

  const totalCount = result?.stats.total ?? 0;
  const activeCount = result?.stats.active ?? 0;
  const inactiveCount = result?.stats.inactive ?? 0;
  const unassignedCount = result?.stats.unassigned ?? 0;

  const subjectNames = result?.stats.subjects ?? [];

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, selectedSubject, selectedStatus]);

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
          <h1 className="text-xl font-bold text-white">Teachers</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase tracking-widest">
            Total
          </p>
          <p className="text-sm font-semibold text-slate-200 mt-0.5">
            {totalCount.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        {/* Stat cards */}
        {loadError ? (
          <div className="bg-red-50 border border-red-200 p-5">
            <p className="text-sm font-semibold text-red-800 mb-2">
              Failed to load teacher statistics
            </p>
            <p className="text-xs text-red-600">{loadError}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Teachers
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {totalCount.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Registered county-wide
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Active
              </p>
              <p className="text-4xl font-bold text-active mt-2">
                {activeCount.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Currently active
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Inactive
              </p>
              <p className="text-4xl font-bold text-pending mt-2">
                {inactiveCount.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">Not currently active</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Unassigned
              </p>
              <p className="text-4xl font-bold text-red-500 mt-2">
                {unassignedCount.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                No class this year
              </p>
            </Card>
          </div>
        )}

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
                    placeholder="Name, ID, school…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 focus:ring-1 focus:ring-secondary outline-none text-slate-700 placeholder:text-slate-300"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Category
                </label>
                <div className="space-y-1">
                  {CATEGORY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedCategory(opt.value)}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                        selectedCategory === opt.value
                          ? "bg-secondary text-white font-medium"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Subject
                </label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 focus:ring-1 focus:ring-secondary outline-none text-slate-700"
                >
                  <option value="all">All Subjects</option>
                  {subjectNames.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Status
                </label>
                <div className="space-y-1">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedStatus(opt.value)}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
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
            {/* Error banner for teachers list */}
            {loadError && (
              <div className="bg-red-50 border border-red-200 p-4 mb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-800 mb-1">
                      Unable to load teachers
                    </p>
                    <p className="text-xs text-red-600">{loadError}</p>
                  </div>
                  <button
                    onClick={reload}
                    className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-800">
                  {totalTeachers}
                </span>{" "}
                teachers found
              </p>
              <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5">
                <button
                  aria-label="Card view"
                  onClick={() => setViewMode("cards")}
                  className={`p-1.5 transition-colors ${
                    viewMode === "cards"
                      ? "bg-slate-900 text-white"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  aria-label="Table view"
                  onClick={() => setViewMode("table")}
                  className={`p-1.5 transition-colors ${
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
            {loadError ? (
              <div className="bg-white border border-slate-300 p-12 text-center">
                <Users className="w-10 h-10 text-red-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">
                  Could not load teachers. Please try again.
                </p>
              </div>
            ) : teachers.length === 0 ? (
              <div className="bg-white border border-slate-300 p-12 text-center">
                <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">
                  No teachers found matching your criteria.
                </p>
              </div>
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {teachers.map((teacher) => (
                  <TeacherCard key={teacher.id} teacher={teacher} />
                ))}
              </div>
            ) : (
              <div className="bg-white border rounded-lg border-slate-300 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/20 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Teacher
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Employee #
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Subject
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        School
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Level
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teachers.map((teacher) => (
                      <tr
                        key={teacher.id}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => router.push(profileHref(teacher.id))}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar
                              src={teacher.photoUrl}
                              firstName={teacher.firstName}
                              lastName={teacher.lastName}
                              role="teacher"
                              size="sm"
                            />
                            <span className="font-medium text-slate-800">
                              {teacher.firstName} {teacher.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {teacher.employeeNumber}
                        </td>
                        <td className="px-4 py-3">
                          {teacher.primarySubject ? (
                            <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600">
                              {teacher.primarySubject}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {teacher.institution.name}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatLevel(teacher.institution.level)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-xs rounded-full font-semibold px-2 py-0.5 ${
                              teacher.isActive
                                ? "text-slate-100 bg-active"
                                : "text-slate-400 bg-slate-100"
                            }`}
                          >
                            {teacher.isActive ? "Active" : "Inactive"}
                          </span>
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
                    else if (currentPage >= totalPages - 3)
                      page = totalPages - 6 + i;
                    else page = currentPage - 3 + i;
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
                    aria-label="Next page"
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
  );
}

/* ─── Teacher Card ───────────────────────────────────────────────────────── */

function TeacherCard({ teacher }: { teacher: CountyTeacher }) {
  return (
    <div className="bg-white border rounded-lg border-slate-300 hover:shadow-md transition-shadow flex overflow-hidden">
      {/* Image — 40% width, stretches to full card height */}
      <div className="w-2/5 shrink-0 relative bg-slate-100">
        <SchoolPhoto
          src={teacher.photoUrl || "/teacher-fallback.jpg"}
          fallback="/teacher-fallback.jpg"
          alt={`${teacher.firstName} ${teacher.lastName}`}
          fill
          sizes="(max-width: 1024px) 40vw, 20vw"
          className="object-cover"
        />
      </div>

      {/* Content — remaining 60% */}
      <div className="flex-1 min-w-0 p-4 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">
              {teacher.firstName} {teacher.lastName}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {teacher.employeeNumber}
            </p>
          </div>
          <span
            className={`shrink-0 text-xs rounded-full font-semibold px-2 py-0.5 ${
              teacher.isActive
                ? "text-slate-100 bg-active"
                : "text-slate-400 bg-slate-100"
            }`}
          >
            {teacher.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="mt-3">
          {teacher.primarySubject ? (
            <span className="text-xs font-semibold px-2.5 py-0.5 bg-slate-100 text-slate-600">
              {teacher.primarySubject}
            </span>
          ) : (
            <span className="text-xs text-slate-400">No subject</span>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {formatLevel(teacher.institution.level)}
          </span>
          <Link
            href={profileHref(teacher.id)}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 transition-colors"
          >
            View Profile <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
