"use client";

import type { ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Avatar, Card } from "@nemis-desktop/ui";
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  Phone,
  Mail,
  Users,
} from "lucide-react";
import { useCountySchoolDetailViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { SchoolPhoto } from "@/components/county/schools/SchoolPhoto";
import { resolveSchoolDetail } from "@/components/county/schools/school-detail-state";

// ── Ownership ─────────────────────────────────────────────────────────────────

const OWNERSHIP_CONFIG: Record<
  string,
  { dot: string; label: string; description: string }
> = {
  GOVERNMENT: {
    dot: "bg-primary",
    label: "Government",
    description: "Government-funded & operated",
  },
  PRIVATE: {
    dot: "bg-secondary",
    label: "Private",
    description: "Privately owned & operated",
  },
  COMMUNITY: {
    dot: "bg-emerald-500",
    label: "Community",
    description: "Community-managed institution",
  },
  NGO: {
    dot: "bg-amber-500",
    label: "NGO",
    description: "Non-governmental organization",
  },
  MISSION: {
    dot: "bg-rose-500",
    label: "Mission",
    description: "Faith-based institution",
  },
};

function formatLevel(level: string) {
  return level.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="text-3xl font-bold text-slate-700 mt-2">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-slate-50 last:border-0">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-widest shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm font-medium text-slate-700 text-right">
        {value}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SchoolDetailPage() {
  const router = useRouter();
  const schoolId = useSearchParams().get("id") ?? "";
  const vm = useCountySchoolDetailViewModel();
  const detail = useViewModel(vm.store, (s) => s.detail);

  useRevalidateOnSync(() => {
    if (schoolId) void vm.load(schoolId);
  }, [vm, schoolId]);

  const requestedId = useViewModel(vm.store, (s) => s.requestedId);
  // The view model outlives the page: never show the previously opened
  // school, nor a not-found left over from it.
  const { school, isLoading, isError } = resolveSchoolDetail(schoolId, requestedId, detail);
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !school) {
    return (
      <>
        <div className="min-h-screen bg-slate-50 font-['Sora'] flex flex-col items-center justify-center gap-4 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
          <p className="text-slate-600 text-sm font-medium">
            School not found or you don&apos;t have access.
          </p>
          <button
            onClick={() => router.push("/government/county/schools")}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Schools
          </button>
        </div>
      </>
    );
  }

  const ownership = OWNERSHIP_CONFIG[school.ownership] ?? {
    dot: "bg-slate-400",
    label: school.ownership,
    description: "",
  };

  const studentCount = school._count?.students ?? 0;
  const teacherCount = school._count?.staff ?? 0;
  const metadata = school.metadata as Record<string, unknown> | undefined;
  const statistics = metadata?.statistics as
    | Record<string, unknown>
    | undefined;
  const maxCapacity = statistics?.maxCapacity
    ? Number(statistics.maxCapacity)
    : 0;
  const enrollmentPct =
    maxCapacity > 0 ? Math.round((studentCount / maxCapacity) * 100) : 0;

  const adminUser = school.users?.find((u) => u.role === "INSTITUTION_ADMIN");
  const principalName =
    school.principalName ||
    (adminUser
      ? `${adminUser.user.firstName} ${adminUser.user.lastName}`
      : null);
  const principalEmail = adminUser?.user?.email ?? null;
  const principalPhoto = adminUser?.user?.photoUrl ?? null;

  const approvalLabel =
    school.approvalStatus === "APPROVED"
      ? "MoE Approved"
      : school.approvalStatus === "PENDING"
        ? "Pending Review"
        : school.approvalStatus === "UNDER_REVIEW"
          ? "Under Review"
          : school.approvalStatus === "REJECTED"
            ? "Rejected"
            : "N/A";

  const approvalBadge =
    school.approvalStatus === "APPROVED"
      ? "bg-active text-slate-100 "
      : school.approvalStatus === "REJECTED"
        ? "bg-red-50 text-red-700 border-red-100"
        : "bg-amber-50 text-amber-700 border-amber-100";

  const complianceLabel =
    enrollmentPct >= 80
      ? "High Standing"
      : enrollmentPct >= 50
        ? "Satisfactory"
        : "Needs Improvement";

  const barColor =
    enrollmentPct >= 80
      ? "bg-sky-600"
      : enrollmentPct >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  const facilityFlags = [
    { key: "hasLibrary", label: "Library" },
    { key: "hasComputerLab", label: "Computer Lab" },
    { key: "hasSportsField", label: "Sports Field" },
    { key: "hasKitchen", label: "Kitchen" },
    { key: "hasCafeteria", label: "Cafeteria" },
    { key: "hasElectricity", label: "Electricity" },
    { key: "hasSafeWater", label: "Safe Water" },
    { key: "hasWaterAccess", label: "Water Access" },
    { key: "hasTextbooks", label: "Textbooks" },
    { key: "hasWash", label: "WASH" },
    { key: "hasPTA", label: "PTA" },
    { key: "hasAuditorium", label: "Auditorium" },
    { key: "hasClinic", label: "Clinic" },
  ].filter(
    (f) => (school as unknown as Record<string, unknown>)[f.key] === true,
  );

  const hasFacilities =
    facilityFlags.length > 0 ||
    school.numBuildings ||
    school.numClassrooms ||
    school.numBathrooms;

  return (
    <>
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="bg-slate-900 px-6 pt-5 pb-6">
          {/* Back */}
          <button
            onClick={() => router.push("/government/county/schools")}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-slate-300 transition-colors mb-5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Schools
          </button>

          {/* Identity row */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Photo */}
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-white/5 shrink-0">
              <SchoolPhoto
                src={school.photoUrl || "/school-fallback.jpg"}
                alt={school.name}
                width={56}
                height={56}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2"></div>

              <h1 className="text-xl font-bold text-white leading-tight">
                {school.name}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {[school.code, school.district?.name, school.county?.name]
                  .filter(Boolean)
                  .join(" · ")}
                {school.establishedYear && ` · Est. ${school.establishedYear}`}
              </p>
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-5 shrink-0 pt-1">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">
                  Students
                </p>
                <p className="text-2xl font-bold text-white mt-0.5">
                  {studentCount.toLocaleString()}
                </p>
              </div>
              <div className="w-px h-9 bg-slate-700" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">
                  Teachers
                </p>
                <p className="text-2xl font-bold text-white mt-0.5">
                  {teacherCount.toLocaleString()}
                </p>
              </div>
              {maxCapacity > 0 && (
                <>
                  <div className="w-px h-9 bg-slate-700" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest">
                      Capacity
                    </p>
                    <p className="text-2xl font-bold text-white mt-0.5">
                      {enrollmentPct}%
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <div className="px-6 py-6 space-y-5 max-w-6xl mx-auto">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Students"
              value={studentCount.toLocaleString()}
              sub="Enrolled"
            />
            <StatCard
              label="Teachers"
              value={teacherCount.toLocaleString()}
              sub="Assigned staff"
            />
            <StatCard
              label="Classrooms"
              value={school.numClassrooms ?? "—"}
              sub="Available rooms"
            />
            <StatCard
              label="Established"
              value={school.establishedYear ?? "—"}
              sub="Year founded"
            />
          </div>

          {/* Info + Leadership */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* School Information */}
            <div className="bg-white border rounded-lg border-slate-100 border border-slate-300 p-6">
              <div className="flex items-center gap-2 mb-5">
                <Building2 className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  School Information
                </p>
              </div>

              {/* Ownership — highlighted */}
              <div className="flex items-center justify-between py-3 mb-1 px-4 bg-slate-50  border border-slate-300">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                  Ownership
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className={`w-2 h-2  ${ownership.dot}`} />
                  {ownership.label}
                  <span className="text-xs font-normal text-slate-400">
                    — {ownership.description}
                  </span>
                </span>
              </div>

              <div className="mt-1">
                <DetailRow
                  label="District"
                  value={school.district?.name || "—"}
                />
                <DetailRow label="County" value={school.county?.name || "—"} />
                {school.address && (
                  <DetailRow label="Address" value={school.address} />
                )}
                <DetailRow
                  label="Levels"
                  value={
                    school.levels
                      ?.map((l) => formatLevel(l.level))
                      .join(", ") || "—"
                  }
                />
                {school.emisCode && (
                  <DetailRow label="EMIS Code" value={school.emisCode} />
                )}
                {school.waecCode && (
                  <DetailRow label="WAEC Code" value={school.waecCode} />
                )}
                {(school.isBoarding !== undefined ||
                  school.isUrban !== undefined) && (
                  <DetailRow
                    label="Type"
                    value={
                      <span className="flex items-center gap-2">
                        {school.isBoarding !== undefined && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs border border-slate-300">
                            {school.isBoarding ? "Boarding" : "Day"}
                          </span>
                        )}
                        {school.isUrban !== undefined && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs border border-slate-300">
                            {school.isUrban ? "Urban" : "Rural"}
                          </span>
                        )}
                      </span>
                    }
                  />
                )}
                {school.accessMode && (
                  <DetailRow
                    label="Access"
                    value={
                      school.accessMode.charAt(0) +
                      school.accessMode.slice(1).toLowerCase()
                    }
                  />
                )}
                {school.contactPhone && (
                  <DetailRow label="Phone" value={school.contactPhone} />
                )}
              </div>
            </div>

            {/* Leadership */}
            <div className="bg-white border rounded-lg border-slate-300  p-6">
              <div className="flex items-center gap-2 mb-5">
                <Users className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  School Leadership
                </p>
              </div>

              {/* Principal — centered hero */}
              <div className="flex flex-col items-center text-center pb-6 mb-1 border-b border-slate-100">
                <Avatar
                  src={principalPhoto}
                  firstName={adminUser?.user.firstName}
                  lastName={adminUser?.user.lastName}
                  role="generic"
                  size={96}
                  className="ring-4 ring-slate-50 mb-4"
                  alt={principalName || "Principal"}
                />
                <p className="text-base font-semibold text-slate-800">
                  {principalName || "No principal assigned"}
                </p>
                <p className="text-xs text-slate-400 mt-1">School Principal</p>
                {principalEmail && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {principalEmail}
                  </p>
                )}
              </div>

              {/* Details */}
              <div className="mt-2">
                <DetailRow
                  label="Accreditation"
                  value={
                    <span
                      className={`px-2.5 py-0.5 text-xs rounded-full font-semibold  border ${approvalBadge}`}
                    >
                      {approvalLabel}
                    </span>
                  }
                />
                {school.contactPersonPhone && (
                  <DetailRow
                    label="Contact"
                    value={
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {school.contactPersonPhone}
                      </span>
                    }
                  />
                )}
                {principalEmail && (
                  <DetailRow
                    label="Email"
                    value={
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {principalEmail}
                      </span>
                    }
                  />
                )}
              </div>
            </div>
          </div>

          {/* Enrollment & Compliance */}
          <div className="bg-white border rounded-lg border-slate-300  p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-6">
              Enrollment &amp; Compliance
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {/* Enrollment */}
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                    Enrollment Rate
                  </p>
                  <span className="text-xl font-bold text-slate-900">
                    {enrollmentPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-700`}
                    style={{ width: `${Math.min(enrollmentPct, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-sm font-semibold text-slate-700">
                    {studentCount.toLocaleString()} students
                  </span>
                  <span className="text-xs text-slate-400">
                    {maxCapacity > 0
                      ? `of ${maxCapacity.toLocaleString()} capacity`
                      : "Capacity not set"}
                  </span>
                </div>
              </div>

              {/* Compliance */}
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                    MoE Compliance
                  </p>
                  <span className="text-xl font-bold text-slate-900">
                    {enrollmentPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-700`}
                    style={{ width: `${Math.min(enrollmentPct, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span
                    className={`text-sm font-semibold ${
                      enrollmentPct >= 80
                        ? "text-sky-700"
                        : enrollmentPct >= 50
                          ? "text-amber-600"
                          : "text-error"
                    }`}
                  >
                    {complianceLabel}
                  </span>
                  <span className="text-xs text-slate-400">Standard: 85%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Facilities */}
          {hasFacilities && (
            <div className="bg-white border border-slate-100 rounded-2xl p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-5">
                Facilities &amp; Infrastructure
              </p>

              {/* Counts */}
              {(school.numBuildings ||
                school.numClassrooms ||
                school.numBathrooms) && (
                <div className="grid grid-cols-3 gap-4 mb-5">
                  {school.numBuildings != null && (
                    <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-2xl font-bold text-slate-900">
                        {school.numBuildings}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Buildings</p>
                    </div>
                  )}
                  {school.numClassrooms != null && (
                    <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-2xl font-bold text-slate-900">
                        {school.numClassrooms}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Classrooms</p>
                    </div>
                  )}
                  {school.numBathrooms != null && (
                    <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-2xl font-bold text-slate-900">
                        {school.numBathrooms}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Bathrooms</p>
                    </div>
                  )}
                </div>
              )}

              {/* Boolean flags */}
              {facilityFlags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {facilityFlags.map((f) => (
                    <span
                      key={f.key}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-medium text-slate-600"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {f.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
