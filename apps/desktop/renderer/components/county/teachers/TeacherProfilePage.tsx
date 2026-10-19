"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Avatar, Card } from "@nemis-desktop/ui";
import { useCountyTeacherDetailViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { resolveSchoolDetail } from "@/components/county/schools/school-detail-state";

const TEACHERS = "/government/county/teachers";

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatLevel(level: string | null | undefined): string {
  if (!level) return "—";
  return level.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatEmploymentType(type: string | null | undefined): string {
  if (!type) return "—";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatGender(gender: string | null | undefined): string {
  if (!gender) return "—";
  return gender.charAt(0) + gender.slice(1).toLowerCase();
}

function yearsOfService(dateOfJoining: string | null | undefined): string {
  if (!dateOfJoining) return "—";
  const years =
    new Date().getFullYear() - new Date(dateOfJoining).getFullYear();
  return years > 0 ? String(years) : "1";
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
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
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

/** County teacher profile, a port of portal-web's county teachers/[id] page,
 * read from this device. */
export function TeacherProfilePage() {
  const router = useRouter();
  const teacherId = useSearchParams().get("id") ?? "";
  const vm = useCountyTeacherDetailViewModel();
  const detail = useViewModel(vm.store, (s) => s.detail);
  const requestedId = useViewModel(vm.store, (s) => s.requestedId);

  useRevalidateOnSync(() => {
    if (teacherId) void vm.load(teacherId);
  }, [vm, teacherId]);

  // The view model outlives the page: never show the previously opened teacher.
  const { school: teacher, isLoading, isError } = resolveSchoolDetail(teacherId, requestedId, detail);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !teacher) {
    return (
      <div className="min-h-screen bg-slate-50 font-['Sora'] flex flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-slate-600 text-sm font-medium">
          Teacher not found or you don&apos;t have access.
        </p>
        <button
          onClick={() => router.push(TEACHERS)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Teachers
        </button>
      </div>
    );
  }

  const fullName = [teacher.firstName, teacher.middleName, teacher.lastName]
    .filter(Boolean)
    .join(" ");
  const phone = teacher.phoneNumber || null;
  const qualifications = teacher.qualifications;
  const classAssignments = teacher.classAssignments;
  const subjectAssignments = teacher.subjectAssignments;

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 px-6 pt-5 pb-6">
        {/* Back */}
        <button
          onClick={() => router.push(TEACHERS)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Teachers
        </button>

        {/* Identity row */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Photo */}
          <div className="w-14 h-14 overflow-hidden bg-slate-800 border border-white/5 shrink-0">
            <Avatar
              src={teacher.photoUrl}
              firstName={teacher.firstName}
              lastName={teacher.lastName}
              role="teacher"
              size={56}
              alt={fullName}
            />
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white leading-tight">
              {fullName || "Unknown Teacher"}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {[teacher.employeeNumber, teacher.institution.name]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-5 shrink-0 pt-1">
            {teacher.primarySubject && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest">
                  Subject
                </p>
                <p className="text-sm font-bold text-white mt-0.5">
                  {teacher.primarySubject}
                </p>
              </div>
            )}
            {teacher.gender && (
              <>
                {teacher.primarySubject && (
                  <div className="w-px h-9 bg-slate-700" />
                )}
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-widest">
                    Gender
                  </p>
                  <p className="text-sm font-bold text-white mt-0.5">
                    {formatGender(teacher.gender)}
                  </p>
                </div>
              </>
            )}
            {teacher.institution.districtName && (
              <>
                {(teacher.primarySubject || teacher.gender) && (
                  <div className="w-px h-9 bg-slate-700" />
                )}
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-widest">
                    District
                  </p>
                  <p className="text-sm font-bold text-white mt-0.5">
                    {teacher.institution.districtName}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-5 max-w-6xl mx-auto">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Years of Service"
            value={yearsOfService(teacher.dateOfJoining)}
            sub={
              teacher.dateOfJoining
                ? `Since ${new Date(teacher.dateOfJoining).getFullYear()}`
                : undefined
            }
          />
          <StatCard
            label="Classes"
            value={classAssignments.length}
            sub={
              classAssignments.some((c) => c.isClassTeacher)
                ? "Class teacher"
                : "Subject only"
            }
          />
          <StatCard
            label="Subjects"
            value={subjectAssignments.length}
            sub="Assigned"
          />
          <StatCard
            label="Status"
            value={teacher.isActive ? "Active" : "Inactive"}
            sub={formatEmploymentType(teacher.employmentType)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Personal & Contact */}
          <Card title="Personal & Contact">
            <div className="space-y-0">
              <DetailRow label="Gender" value={formatGender(teacher.gender)} />
              <DetailRow label="Date of Birth" value={formatDate(teacher.dateOfBirth)} />
              <DetailRow label="National ID" value={teacher.nationalId || "—"} />
              <DetailRow label="Phone" value={phone || "—"} />
              <DetailRow label="Address" value={teacher.address || "—"} />
              <DetailRow label="Date Joined" value={formatDate(teacher.dateOfJoining)} />
              {teacher.dateOfLeaving && (
                <DetailRow label="Date Left" value={formatDate(teacher.dateOfLeaving)} />
              )}
              <DetailRow label="Position" value={formatLevel(teacher.position)} />
              <DetailRow label="Employment" value={formatEmploymentType(teacher.employmentType)} />
            </div>
          </Card>

          {/* School Assignment */}
          <Card title="School Assignment">
            <div className="space-y-0">
              <DetailRow label="School" value={teacher.institution.name || "—"} />
              <DetailRow label="District" value={teacher.institution.districtName || "—"} />
              <DetailRow label="County" value={teacher.institution.countyName || "—"} />
              <DetailRow label="Level" value={formatLevel(teacher.institution.level)} />
              <DetailRow label="Employee #" value={teacher.employeeNumber || "—"} />
            </div>

            {/* Classes */}
            {classAssignments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Classes
                </p>
                <div className="flex flex-wrap gap-2">
                  {classAssignments.map((ca) => (
                    <span
                      key={ca.id}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-700"
                    >
                      <span>{ca.class.name}</span>
                      {ca.isClassTeacher && (
                        <span className="text-[10px] font-semibold text-white bg-active px-1 py-0.5">
                          CT
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Subjects */}
          <Card title="Subjects Taught">
            {subjectAssignments.length === 0 ? (
              <p className="text-sm text-slate-400">No subjects assigned.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {subjectAssignments.map((sa) => (
                  <span
                    key={sa.id}
                    className="text-xs font-medium px-3 py-1.5 bg-slate-100 text-slate-700"
                  >
                    {sa.subject.name}
                    {sa.subject.code && (
                      <span className="ml-1.5 text-slate-400">
                        ({sa.subject.code})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* Qualifications */}
          <Card title="Qualifications">
            {qualifications.length === 0 ? (
              <p className="text-sm text-slate-400">
                No qualifications recorded.
              </p>
            ) : (
              <ul className="space-y-2">
                {qualifications.map((q, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-slate-700"
                  >
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                    {q}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
