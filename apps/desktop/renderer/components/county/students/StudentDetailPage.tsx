"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CreditCard,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  User,
  Users,
} from "lucide-react";
import { Avatar } from "@nemis-desktop/ui";
import { formatNemisId } from "@nemis-desktop/shared";
import type { StudentAcademicRecordResult } from "@nemis-desktop/types";
import { mergeStudentRecord, outcomeLabel } from "@nemis-desktop/presentation";
import { useCountyStudentDetailViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { countyBridge } from "@/services/nemis-bridge/county";
import { resolveSchoolDetail } from "@/components/county/schools/school-detail-state";

const UNREACHABLE = "Showing this county's records only — connect to see years at other schools.";

type Tab = "overview" | "record" | "transfers";
type Remote = { state: "loading" } | { state: "done"; result: StudentAcademicRecordResult };

/** portal-web school-admin student page's DetailRow. */
function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-gray-400 flex-shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 mt-0.5">
          {value || <span className="text-gray-400 italic">Not provided</span>}
        </p>
      </div>
    </div>
  );
}

function formatGradeLevel(grade?: string | null) {
  if (!grade) return null;
  if (grade.startsWith("GRADE_")) return `Grade ${grade.replace("GRADE_", "")}`;
  return grade;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value)}%`);

const OUTCOME_STYLE: Record<string, string> = {
  Promoted: "text-emerald-700",
  Retained: "text-amber-600",
  Graduated: "text-sky-700",
  "In progress": "text-slate-600",
  "Not recorded": "text-slate-400 italic",
};

/** County student detail (new design, layout B): Overview · Academic record ·
 * Transfers. Local years show at once; when online, the child's years and
 * transfers at other schools are fetched once per visit and merged in. */
export function StudentDetailPage() {
  const router = useRouter();
  const studentId = useSearchParams().get("id") ?? "";
  const vm = useCountyStudentDetailViewModel();
  const detail = useViewModel(vm.store, (s) => s.detail);
  const requestedId = useViewModel(vm.store, (s) => s.requestedId);
  const [tab, setTab] = useState<Tab>("overview");
  const [remote, setRemote] = useState<Remote>({ state: "loading" });

  useRevalidateOnSync(() => {
    if (studentId) void vm.load(studentId);
  }, [vm, studentId]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setRemote({ state: "loading" });
    void countyBridge
      .getStudentRecord(studentId)
      .catch((): StudentAcademicRecordResult => ({ status: "unavailable" }))
      .then((result) => {
        if (!cancelled) setRemote({ state: "done", result });
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // The view model outlives the page: never show the previously opened student.
  const { school: student, isLoading, isError } = resolveSchoolDetail(
    studentId,
    requestedId,
    detail.status === "success" || detail.status === "refreshing"
      ? { ...detail, data: { ...detail.data, id: detail.data.student.id } }
      : detail,
  );

  const merged = useMemo(() => {
    if (!student) return { years: [], transfers: [] };
    const record = remote.state === "done" && remote.result.status === "ok" ? remote.result.record : null;
    const localIds = new Set([student.institution.id, ...student.years.map((y) => y.institutionId)]);
    return mergeStudentRecord(studentId, student, record, localIds);
  }, [student, remote, studentId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !student) {
    return (
      <div className="min-h-screen bg-slate-50 font-['Sora'] flex flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-slate-600 text-sm font-medium">Student not found or you don&apos;t have access.</p>
        <button
          onClick={() => router.push("/government/county/students")}
          className="text-sm text-slate-700 font-semibold underline underline-offset-2"
        >
          Back to Students
        </button>
      </div>
    );
  }

  const s = student.student;
  const fullName = `${s.firstName} ${s.lastName}`;
  const primaryGuardian = student.guardians.find((g) => g.isPrimary) ?? student.guardians[0];
  const otherGuardians = student.guardians.filter((g) => g !== primaryGuardian);
  const unavailable = remote.state === "done" && remote.result.status === "unavailable";

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "record", label: "Academic record" },
    { id: "transfers", label: `Transfers (${merged.transfers.length})` },
  ];

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      {/* Header band */}
      <div className="bg-slate-900 text-white px-6 py-5">
        <button
          onClick={() => router.push("/government/county/students")}
          className="flex items-center text-slate-400 hover:text-white mb-4 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Students
        </button>
        <div className="flex items-center gap-4">
          <Avatar src={s.photoUrl} firstName={s.firstName} lastName={s.lastName} role="student" size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white leading-tight">{fullName}</h1>
            <p className="text-sm text-slate-400 mt-1">
              {[
                s.nemisId ? `NEMIS ${formatNemisId(s.nemisId)}` : null,
                formatGradeLevel(student.currentEnrollment?.gradeLevel ?? s.gradeLevel),
                student.institution.name,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <span
            className={`text-xs rounded-full font-semibold px-2 py-0.5 ${
              s.isActive ? "text-slate-100 bg-active" : "text-slate-400 bg-slate-800"
            }`}
          >
            {s.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5 max-w-6xl mx-auto">
        {/* Tabs */}
        <div role="tablist" className="flex gap-6 border-b border-slate-300">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`pb-2 text-sm transition-colors ${
                tab === t.id
                  ? "border-b-2 border-sky-700 font-semibold text-slate-900"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-gray-300 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-sky-700" />
                Personal Information
              </h2>
              <div className="space-y-4">
                <DetailRow icon={<GraduationCap className="w-4 h-4" />} label="Grade Level" value={formatGradeLevel(s.gradeLevel)} />
                <DetailRow icon={<Calendar className="w-4 h-4" />} label="Date of Birth" value={formatDate(s.dateOfBirth)} />
                <DetailRow icon={<CreditCard className="w-4 h-4" />} label="National ID" value={s.nationalId} />
                <DetailRow icon={<Calendar className="w-4 h-4" />} label="Admission Date" value={formatDate(s.admissionDate)} />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-300 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Phone className="w-4 h-4 text-sky-700" />
                Contact Information
              </h2>
              <div className="space-y-4">
                <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone Number" value={s.phoneNumber} />
                <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={s.email} />
                <DetailRow icon={<MapPin className="w-4 h-4" />} label="Address" value={s.address} />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-300 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-sky-700" />
                Enrollment
              </h2>
              {student.currentEnrollment ? (
                <div className="space-y-4">
                  <DetailRow
                    icon={<BookOpen className="w-4 h-4" />}
                    label="Class"
                    value={`${student.currentEnrollment.className} (Grade ${student.currentEnrollment.gradeLevel ?? ""})`}
                  />
                  <DetailRow
                    icon={<Calendar className="w-4 h-4" />}
                    label="Academic Year"
                    value={student.currentEnrollment.academicYearName}
                  />
                  <DetailRow icon={<GraduationCap className="w-4 h-4" />} label="School" value={student.institution.name} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Not currently enrolled in any class.</p>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-300 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-700" />
                Guardian / Parent
              </h2>
              {primaryGuardian ? (
                <div className="space-y-4">
                  <DetailRow
                    icon={<User className="w-4 h-4" />}
                    label="Name"
                    value={`${primaryGuardian.firstName} ${primaryGuardian.lastName}`}
                  />
                  <DetailRow icon={<Users className="w-4 h-4" />} label="Relationship" value={primaryGuardian.relationship} />
                  <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone" value={primaryGuardian.phoneNumber} />
                  <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={primaryGuardian.email} />
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No guardian information on file.</p>
              )}
              {otherGuardians.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 font-medium mb-2">Additional Guardians ({otherGuardians.length})</p>
                  <div className="space-y-2">
                    {otherGuardians.map((g) => (
                      <div
                        key={`${g.firstName}-${g.lastName}-${g.relationship}`}
                        className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                      >
                        <span className="text-sm text-gray-800">
                          {g.firstName} {g.lastName}
                        </span>
                        <span className="text-xs text-gray-500">{g.relationship}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "record" && (
          <div className="space-y-3">
            {remote.state === "loading" && (
              <p className="text-xs text-slate-400">Checking for years at other schools…</p>
            )}
            {unavailable && <p className="text-xs text-slate-500">{UNREACHABLE}</p>}
            <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Year", "Grade", "School", "Class", "Outcome", "Average", "Attendance"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {merged.years.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                        No school years on record yet.
                      </td>
                    </tr>
                  ) : (
                    merged.years.map((y) => {
                      const outcome = outcomeLabel(y);
                      return (
                        <tr key={`${y.academicYearId}-${y.institutionId}`}>
                          <td className="px-4 py-3 font-medium text-slate-800">{y.academicYearName}</td>
                          <td className="px-4 py-3 text-slate-600">{formatGradeLevel(y.gradeLevel) ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {y.institutionName}
                            {y.otherCounty && (
                              <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                                Other county
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{y.className ?? "—"}</td>
                          <td className={`px-4 py-3 font-semibold ${OUTCOME_STYLE[outcome] ?? ""}`}>{outcome}</td>
                          <td className="px-4 py-3 text-slate-600">{percent(y.average)}</td>
                          <td className="px-4 py-3 text-slate-600">{percent(y.attendanceRate)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "transfers" && (
          <div className="space-y-3">
            {unavailable && <p className="text-xs text-slate-500">{UNREACHABLE}</p>}
            <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Date", "From", "To", "Status", "Reason", "Reviewed"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {merged.transfers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                        No transfers on record.
                      </td>
                    </tr>
                  ) : (
                    merged.transfers.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-3 text-slate-600">{formatDate(t.date)}</td>
                        <td className="px-4 py-3 text-slate-800">{t.fromInstitutionName}</td>
                        <td className="px-4 py-3 text-slate-800">{t.toInstitutionName}</td>
                        <td className="px-4 py-3 text-slate-600">{t.status}</td>
                        <td className="px-4 py-3 text-slate-600">{t.reason}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {[t.reviewedByName, formatDate(t.reviewedAt)].filter(Boolean).join(" · ") || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
