"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Users,
  School,
  MessageSquare,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Avatar } from "@nemis-desktop/ui";
import { formatNemisId } from "@nemis-desktop/shared";
import type { CountyGuardianChild } from "@nemis-desktop/types";
import { useCountyGuardianDetailViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { resolveSchoolDetail } from "@/components/county/schools/school-detail-state";

function StudentCard({ student }: { student: CountyGuardianChild }) {
  return (
    <div className="bg-white border border-slate-300 p-4 flex items-center gap-4">
      <Avatar
        src={student.photoUrl}
        firstName={student.firstName}
        lastName={student.lastName}
        role="student"
        size={48}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Link
            href={`/government/county/students/details?id=${encodeURIComponent(student.id)}`}
            className="text-sm font-semibold text-slate-800 truncate hover:underline"
          >
            {student.firstName} {student.lastName}
          </Link>
          {/* The web always shows "Active"; the desktop shows the child's real status. */}
          {student.isActive ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5  bg-active  text-slate-100 shrink-0">Active</span>
          ) : (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-200 text-slate-500 shrink-0">Inactive</span>
          )}
          {student.isPrimary && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-secondary text-slate-100 shrink-0">
              Primary
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400">{student.nemisId ? formatNemisId(student.nemisId) : "—"}</p>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
          <School className="w-3 h-3 shrink-0" />
          <span className="truncate">{student.institution.name}</span>
        </div>
        {student.institution.districtName && (
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
            <MapPin className="w-3 h-3 shrink-0" />
            <span>{student.institution.districtName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Port of portal-web county/parents/[id] (docs/superpowers/specs/2026-10-18-county-parents-design.md §2.2),
 * with the child count, districts and child status filled in from local data. */
export function ParentProfilePage() {
  const router = useRouter();
  const guardianId = useSearchParams().get("id") ?? "";
  const vm = useCountyGuardianDetailViewModel();
  const detail = useViewModel(vm.store, (s) => s.detail);
  const requestedId = useViewModel(vm.store, (s) => s.requestedId);

  useRevalidateOnSync(() => {
    if (guardianId) void vm.load(guardianId);
  }, [vm, guardianId]);

  // The view model outlives the page: never show the previously opened parent.
  const { school: guardian, isLoading, isError } = resolveSchoolDetail(guardianId, requestedId, detail);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !guardian) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm font-semibold text-slate-700">Guardian not found</p>
        <button onClick={() => router.back()} className="text-xs text-slate-500 underline underline-offset-2">
          Go back
        </button>
      </div>
    );
  }

  const students = guardian.children;
  const districts = guardian.districts;

  const engagementLevel =
    guardian.email && guardian.isEmergencyContact
      ? "High"
      : guardian.email || guardian.isEmergencyContact
        ? "Medium"
        : "Low";

  const engagementColor =
    engagementLevel === "High"
      ? "text-slate-300 bg-active"
      : engagementLevel === "Medium"
        ? "text-slate-100 bg-pending"
        : "text-slate-500 bg-slate-100";

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Parents
        </button>
      </div>

      <div className="px-6 py-6 space-y-5 max-w-5xl mx-auto">
        {/* Hero card */}
        <div className="bg-white border border-slate-300 p-6">
          <div className="flex items-start gap-5">
            <Avatar
              src={guardian.photoUrl}
              firstName={guardian.firstName}
              lastName={guardian.lastName}
              role="parent"
              size={80}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-slate-900">
                  {guardian.firstName} {guardian.lastName}
                </h1>
              </div>
              <p className="text-sm text-sky-600 font-medium mb-1">{guardian.relationship}</p>
              {districts.length > 0 && (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {districts.join(" · ")}
                </p>
              )}
            </div>

            {/* Children count box */}
            <div className="shrink-0 bg-slate-50 border border-gray-300  px-5 py-2 text-center min-w-[80px]">
              <p className="text-3xl font-bold text-slate-900">{guardian.studentsCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">Children</p>
            </div>
          </div>
        </div>

        {/* Two-column section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Contact & Personal Info */}
          <div className="bg-white border rounded-lg border-slate-300 p-5 space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Contact &amp; Personal Information
            </p>

            {guardian.phoneNumber && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full  bg-slate-100 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Phone</p>
                  <p className="text-sm text-slate-700">{guardian.phoneNumber}</p>
                </div>
              </div>
            )}

            {guardian.email ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400">Email</p>
                  <p className="text-sm text-slate-700 break-all">{guardian.email}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 opacity-40">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Email</p>
                  <p className="text-sm text-slate-400 italic">Not provided</p>
                </div>
              </div>
            )}

            {districts.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">District</p>
                  <p className="text-sm text-slate-700">{districts.join(", ")}</p>
                </div>
              </div>
            )}

            {guardian.occupation && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 flex items-center justify-center shrink-0">
                  <Briefcase className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Occupation</p>
                  <p className="text-sm text-slate-700">{guardian.occupation}</p>
                </div>
              </div>
            )}
          </div>

          {/* Engagement */}
          <div className="bg-white border rounded-lg border-slate-300 p-5 space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Engagement</p>

            <div className={` px-4 py-3 flex items-center gap-3 ${engagementColor}`}>
              {engagementLevel === "High" ? (
                <CheckCircle className="w-5 h-5 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-bold">{engagementLevel} Engagement</p>
                <p className="text-[11px] ">
                  {engagementLevel === "High"
                    ? "Has email and is an emergency contact"
                    : engagementLevel === "Medium"
                      ? "Partially reachable — missing email or emergency contact status"
                      : "Phone only — consider collecting email"}
                </p>
              </div>
            </div>

            {guardian.isEmergencyContact && (
              <div className="flex items-center gap-2 text-[12px] text-slate-600 bg-red-50 px-3 py-2.5 ">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="font-medium">Designated emergency contact</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Students covered</p>
                <p className="text-sm font-semibold text-slate-700">
                  {guardian.studentsCount} {guardian.studentsCount === 1 ? "student" : "students"}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              {/* A County Admin can't message parents: open Messages with the
                  School Admin of the parent's school selected (§5.5). */}
              {guardian.messageInstitutionId ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/government/county/messages?institutionId=${encodeURIComponent(guardian.messageInstitutionId!)}`,
                    )
                  }
                  className="w-full flex items-center justify-center gap-2 bg-secondary/80 text-white text-sm font-semibold py-3 rounded-button hover:bg-secondary transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send Message
                </button>
              ) : (
                <button
                  disabled
                  title="No linked school"
                  className="w-full flex items-center justify-center gap-2 bg-slate-200 text-slate-400 text-sm font-semibold py-3 rounded-full cursor-not-allowed"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send Message
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Children section */}
        {students.length > 0 && (
          <div>
            <p className="text-sm font-bold text-slate-800 mb-3">Children ({students.length})</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {students.map((student) => (
                <StudentCard key={student.id} student={student} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
