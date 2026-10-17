"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Spinner, Avatar, Card } from "@nemis-desktop/ui";
import { formatNemisId } from "@nemis-desktop/shared";
import type { CountyStudentListItem as CountyStudent, CountyStudentsQuery } from "@nemis-desktop/types";
import { useCountyStudentsViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { SchoolPhoto } from "@/components/county/schools/SchoolPhoto";
import {
  Search,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  LayoutGrid,
  List,
} from "lucide-react";

const PERFORMANCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Excellent", label: "Excellent" },
  { value: "Good", label: "Good" },
  { value: "Average", label: "Average" },
  { value: "Below Avg", label: "Below Avg" },
];

const GRADE_LEVELS = [
  { value: "all", label: "All Grades" },
  { value: "KG", label: "KG" },
  { value: "K1", label: "K1" },
  { value: "K2", label: "K2" },
  { value: "GRADE_1", label: "Grade 1" },
  { value: "GRADE_2", label: "Grade 2" },
  { value: "GRADE_3", label: "Grade 3" },
  { value: "GRADE_4", label: "Grade 4" },
  { value: "GRADE_5", label: "Grade 5" },
  { value: "GRADE_6", label: "Grade 6" },
  { value: "GRADE_7", label: "Grade 7" },
  { value: "GRADE_8", label: "Grade 8" },
  { value: "GRADE_9", label: "Grade 9" },
  { value: "GRADE_10", label: "Grade 10" },
  { value: "GRADE_11", label: "Grade 11" },
  { value: "GRADE_12", label: "Grade 12" },
];

function formatGradeLevel(level: string) {
  return level.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPerformanceStyle(label: string | null) {
  switch (label) {
    case "Excellent":
      return "text-emerald-600";
    case "Good":
      return "text-sky-600";
    case "Average":
      return "text-amber-500";
    case "Below Avg":
      return "text-red-500";
    default:
      return "text-slate-400";
  }
}

export default function StudentsPage() {

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [selectedPerformance, setSelectedPerformance] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [currentPage, setCurrentPage] = useState(1);

  // One local read replaces the web's five queries (county, districts,
  // schools, stats, the page).
  const vm = useCountyStudentsViewModel();
  const summary = useViewModel(vm.store, (s) => s.summary);
  const query: CountyStudentsQuery = {
    search: searchTerm || undefined,
    institutionId: selectedSchool !== "all" ? selectedSchool : undefined,
    districtId: selectedDistrict !== "all" ? selectedDistrict : undefined,
    gradeLevel: selectedGrade !== "all" ? selectedGrade : undefined,
    performance: selectedPerformance !== "all" ? selectedPerformance : undefined,
    status: selectedStatus === "active" || selectedStatus === "inactive" ? selectedStatus : undefined,
    page: currentPage,
    limit: 12,
  };
  useRevalidateOnSync(() => {
    void vm.load(query);
  }, [vm, JSON.stringify(query)]);

  const result =
    summary.status === "success" || summary.status === "refreshing" ? summary.data : null;
  const county = result?.county ?? null;
  const districts = result?.districts ?? [];
  const schools = result?.schools ?? [];
  const students = result?.data ?? [];
  const totalStudents = result?.total || 0;
  const totalPages = result?.totalPages || 1;

  // Total = active + inactive (every student at the county's active schools).
  const totalCount = result?.stats.total ?? 0;
  const activeCount = result?.stats.active ?? 0;
  const inactiveCount = result?.stats.inactive ?? 0;
  const schoolCount = schools.length;

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedSchool,
    selectedDistrict,
    selectedGrade,
    selectedPerformance,
    selectedStatus,
  ]);

  // Only the very first load shows the spinner; refreshes keep the page.
  if (summary.status === "idle" || summary.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
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
            <h1 className="text-xl font-bold text-white">Students</h1>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Students
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
              <p className="text-xs text-slate-400 mt-1">Currently enrolled</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Inactive
              </p>
              <p className="text-4xl font-bold text-pending mt-2">
                {inactiveCount.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Not currently enrolled
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Schools
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {schoolCount}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Across all districts
              </p>
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
                      placeholder="Name or ID…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 focus:ring-1 focus:ring-secondary  outline-none text-slate-700 placeholder:text-slate-300"
                    />
                  </div>
                </div>

                {/* School */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    School
                  </label>
                  <select
                    value={selectedSchool}
                    onChange={(e) => setSelectedSchool(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 focus:ring-1 focus:ring-secondary  outline-none text-slate-700"
                  >
                    <option value="all">All Schools</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* District */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    District
                  </label>
                  <select
                    value={selectedDistrict}
                    onChange={(e) => setSelectedDistrict(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 focus:ring-1 focus:ring-secondary  outline-none text-slate-700"
                  >
                    <option value="all">All Districts</option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Grade */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Grade
                  </label>
                  <select
                    value={selectedGrade}
                    onChange={(e) => setSelectedGrade(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 focus:ring-1 focus:ring-secondary  outline-none text-slate-700"
                  >
                    {GRADE_LEVELS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Performance */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Performance
                  </label>
                  <div className="space-y-1">
                    {PERFORMANCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedPerformance(opt.value)}
                        className={`w-full text-left px-3 py-1.5 text-sm  transition-colors ${
                          selectedPerformance === opt.value
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
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                    {["all", "active", "inactive"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSelectedStatus(s)}
                        className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                          selectedStatus === s
                            ? "bg-slate-900 text-white"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {s === "all" ? "All" : s}
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
                    {totalStudents}
                  </span>{" "}
                  students found
                </p>
                <div className="flex items-center gap-1 bg-white border border-slate-200  p-0.5">
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
                  <button
                    aria-label="Card view"
                    onClick={() => setViewMode("cards")}
                    className={`p-1.5  transition-colors ${
                      viewMode === "cards"
                        ? "bg-slate-900 text-white"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                
                </div>
              </div>

              {/* Empty state */}
              {students.length === 0 ? (
                <div className="bg-white border border-slate-300  text-center">
                  <GraduationCap className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">
                    No students found matching your criteria.
                  </p>
                </div>
              ) : viewMode === "cards" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {students.map((student: CountyStudent) => (
                    <StudentCard key={student.id} student={student} />
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/20  border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Student
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          NEMIS ID
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Grade
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Performance
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          School
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((student: CountyStudent) => (
                        <tr key={student.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar
                                src={student.photoUrl}
                                firstName={student.firstName}
                                lastName={student.lastName}
                                role="student"
                                size="sm"
                              />
                              <span className="font-medium text-slate-800">
                                <Link href={`/government/county/students/details?id=${encodeURIComponent(student.id)}`} className="hover:underline">
                                  {student.firstName} {student.lastName}
                                </Link>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {student.nemisId ? formatNemisId(student.nemisId) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {student.currentClass ? (
                              <span className="text-xs font-medium px-2 py-0.5  bg-slate-100 text-slate-600">
                                {formatGradeLevel(
                                  student.currentClass.gradeLevel,
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">
                                N/A
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-sm font-semibold ${getPerformanceStyle(student.performanceLabel)}`}
                            >
                              {student.performanceLabel || "N/A"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {student.institution.name}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs rounded-full font-semibold px-2 py-0.5  ${
                                student.isActive
                                  ? "text-slate-100 bg-active"
                                  : "text-slate-400 bg-slate-100"
                              }`}
                            >
                              {student.isActive ? "Active" : "Inactive"}
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

/* ─── Student Card ───────────────────────────────────────────────────────── */

function StudentCard({ student }: { student: CountyStudent }) {
  return (
    <div className="bg-white rounded-lg border border-slate-300 pb-2 hover:shadow-md transition-shadow relative">
      {student.isActive && (
        <span className="absolute top-4 right-2 text-xs py-0.5 px-2 bg-active text-slate-100">
          Active
        </span>
      )}
      <div className="flex flex-col items-center text-center">
        <div className="w-full relative aspect-square overflow-hidden bg-slate-100 mb-3 ">
          <SchoolPhoto
            fallback="/student-fallback.jpg"
            src={student.photoUrl || "/student-fallback.jpg"}
            alt={`${student.firstName} ${student.lastName}`}
            fill
            sizes="(max-width: 640px) 150px, (max-width: 1280px) 200px, 250px"
            quality={100}
            className=" object-cover"
          />
        </div>
        <p className="text-sm font-semibold text-slate-800">
          <Link href={`/government/county/students/details?id=${encodeURIComponent(student.id)}`} className="hover:underline">
            {student.firstName} {student.lastName}
          </Link>
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {student.nemisId ? formatNemisId(student.nemisId) : "—"}
        </p>

        {student.currentClass && (
          <span className="mt-2 px-3 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
            {formatGradeLevel(student.currentClass.gradeLevel)}
          </span>
        )}

        <span
          className={`mt-1.5 text-xs font-semibold ${getPerformanceStyle(student.performanceLabel)}`}
        >
          {student.performanceLabel || "—"}
        </span>

        <div className="mt-3 pt-3 border-t border-slate-100 w-full">
          <p className="text-xs font-medium text-slate-700 truncate">
            {student.institution.name}
          </p>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">
            {student.institution.districtName ||
              student.institution.countyName ||
              ""}
          </p>
        </div>
      </div>
    </div>
  );
}
