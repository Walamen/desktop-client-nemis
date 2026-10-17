"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  Spinner,
  showCredentials,
  showError,
  showSuccess,
} from "@nemis-desktop/ui";
import { ArrowLeft, Check } from "lucide-react";
import {
  InstitutionLevel,
  AccessMode,
  type SchoolRegistrationInput,
  type SchoolRegistrationPayload,
} from "@nemis-desktop/types";
import PhoneInput from "react-phone-number-input";
// Bundled flags: the default loads flag images from a CDN, which the CSP
// blocks and which fails offline.
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";
import { useCountySchoolRegistrationViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { countyBridge } from "@/services/nemis-bridge/county";
import {
  countError,
  emailError,
  establishedYearError,
  principalNameError,
} from "./registration/server-rules";
import { settleOne } from "./registration/settle";
import { acknowledgeRegistrations } from "./registration/notices";

const SAVED_OFFLINE = "Saved on this device. It will be sent when you're back online.";
/** The online wait after Save (spec §5.4). */
const SETTLE_MS = 5_000;

const STEPS = [
  { number: 1, title: "School Identity", description: "Name, code & levels" },
  { number: 2, title: "Admin Contact", description: "Principal & email" },
  { number: 3, title: "Location & Classification", description: "Optional" },
  { number: 4, title: "Physical Infrastructure", description: "Optional" },
  { number: 5, title: "Enrollment Statistics", description: "Optional" },
  { number: 6, title: "Facilities & Support", description: "Optional" },
  { number: 7, title: "Declaration & Review", description: "Optional" },
];

interface GenderCount {
  male: string;
  female: string;
}

interface SchoolFormData {
  // Step 1 – School Identity
  schoolName: string;
  district: string;
  levels: InstitutionLevel[];
  ownership: string;
  emisCode: string;
  // Step 2 – Admin Contact
  principalName: string;
  phone: string;
  email: string;
  waecCode: string;
  // Step 3 – Location & Classification
  address: string;
  communityTown: string;
  establishedYear: string;
  isBoarding: boolean;
  isUrban: boolean;
  accessMode: string;
  contactPhone: string;
  contactPersonPhone: string;
  // Step 4 – Physical Infrastructure
  numBuildings: string;
  numClassrooms: string;
  numChairs: string;
  numBenches: string;
  numDesks: string;
  numTables: string;
  numBathrooms: string;
  hasWaterAccess: boolean;
  waterSource: string;
  // Step 5 – Enrollment Statistics (metadata)
  nursery: GenderCount;
  k1: GenderCount;
  k2: GenderCount;
  grade1: GenderCount;
  grade2: GenderCount;
  grade3: GenderCount;
  grade4: GenderCount;
  grade5: GenderCount;
  grade6: GenderCount;
  teachersPrimary: GenderCount;
  teachersMiddle: GenderCount;
  teachersSenior: GenderCount;
  // Step 6 – Facilities & Support
  hasLibrary: boolean;
  hasKitchen: boolean;
  hasCafeteria: boolean;
  hasSportsField: boolean;
  hasSportsActivities: boolean;
  hasAuditorium: boolean;
  hasElectricity: boolean;
  hasComputerLab: boolean;
  hasClinic: boolean;
  hasSafeWater: boolean;
  hasWash: boolean;
  hasTextbooks: boolean;
  hasCurriculum: boolean;
  isSpacious: boolean;
  isVentilated: boolean;
  isWellLighted: boolean;
  hasMoeSupport: boolean;
  partnerOrganization: string;
  hasPTA: boolean;
  // Step 7 – Declaration
  accuracyDeclaration: boolean;
  complianceAgreement: boolean;
  inspectionConsent: boolean;
}

const emptyGenderCount = (): GenderCount => ({ male: "", female: "" });

const COUNT_FIELDS = [
  "numBuildings",
  "numClassrooms",
  "numChairs",
  "numBenches",
  "numDesks",
  "numTables",
  "numBathrooms",
] as const;
type CountField = (typeof COUNT_FIELDS)[number];

const ENROLLMENT_KEYS = ["nursery", "k1", "k2", "grade1", "grade2", "grade3", "grade4", "grade5", "grade6"] as const;
const TEACHER_KEYS = { teachersPrimary: "primary", teachersMiddle: "middleSchool", teachersSenior: "seniorHigh" } as const;
const STAT_FIELDS = [...ENROLLMENT_KEYS, ...(Object.keys(TEACHER_KEYS) as (keyof typeof TEACHER_KEYS)[])];

const FLAG_FIELDS = [
  "isBoarding", "isUrban", "hasWaterAccess", "hasMoeSupport", "hasPTA", "hasLibrary", "hasKitchen",
  "hasCafeteria", "hasSportsField", "hasSportsActivities", "hasAuditorium", "hasElectricity",
  "hasComputerLab", "hasClinic", "hasSafeWater", "hasWash", "hasTextbooks", "hasCurriculum",
  "isSpacious", "isVentilated", "isWellLighted",
] as const;
const TEXT_FIELDS = [
  "emisCode", "waecCode", "address", "communityTown", "accessMode", "contactPhone",
  "contactPersonPhone", "waterSource", "partnerOrganization",
] as const;

function genderOf(value: unknown): GenderCount {
  const g = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (n: unknown) => (typeof n === "number" && n > 0 ? String(n) : "");
  return { male: text(g.male), female: text(g.female) };
}

/** "Fix and resend": the form fields a saved school's payload fills. */
function formFromPayload(
  p: SchoolRegistrationPayload,
  districtIds: readonly string[],
): Partial<SchoolFormData> {
  const admin = p.admins[0];
  const metadata = (p.metadata ?? {}) as Record<string, Record<string, unknown> | string | undefined>;
  const enrollment = (metadata.enrollmentStats ?? {}) as Record<string, unknown>;
  const teachers = (metadata.teacherStats ?? {}) as Record<string, unknown>;
  const form: Partial<SchoolFormData> = {
    schoolName: p.name,
    district: districtIds.includes(p.districtId) ? p.districtId : "",
    levels: p.levels as InstitutionLevel[],
    ownership: p.ownership,
    principalName: p.principalName ?? (admin ? `${admin.firstName} ${admin.lastName}` : ""),
    email: admin?.email ?? "",
    phone: typeof metadata.phone === "string" ? metadata.phone : "",
    establishedYear: p.establishedYear ? String(p.establishedYear) : "",
  };
  for (const field of TEXT_FIELDS) form[field] = p[field] ?? "";
  for (const field of FLAG_FIELDS) form[field] = p[field] ?? false;
  for (const field of COUNT_FIELDS) form[field] = p[field] !== undefined ? String(p[field]) : "";
  for (const key of ENROLLMENT_KEYS) form[key] = genderOf(enrollment[key]);
  for (const [field, key] of Object.entries(TEACHER_KEYS) as [keyof typeof TEACHER_KEYS, string][]) {
    form[field] = genderOf(teachers[key]);
  }
  return form;
}

const inputCls =
  "w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-all outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-700/20";

const checkboxCls = "w-4 h-4 text-sky-700 focus:ring-sky-700 rounded";

/** Desktop-only check messages (server rules caught before saving offline). */
const withError = (message: string | null) =>
  message ? `${inputCls} border-red-500` : inputCls;

function FieldError({ message }: { message: string | null }) {
  return message ? <p className="text-xs text-red-500 mt-1">{message}</p> : null;
}

function GenderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: GenderCount;
  onChange: (v: GenderCount) => void;
}) {
  const total = (parseInt(value.male) || 0) + (parseInt(value.female) || 0);
  return (
    <div className="grid grid-cols-4 gap-2 items-center">
      <span className="text-sm text-gray-700 col-span-1">{label}</span>
      <input
        type="number"
        min="0"
        value={value.male}
        onChange={(e) => onChange({ ...value, male: e.target.value })}
        placeholder="M"
        className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-center focus:outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-700/20"
      />
      <input
        type="number"
        min="0"
        value={value.female}
        onChange={(e) => onChange({ ...value, female: e.target.value })}
        placeholder="F"
        className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-center focus:outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-700/20"
      />
      <span className="text-sm font-semibold text-center text-slate-700">
        {total || "—"}
      </span>
    </div>
  );
}

export function CreateSchoolPage() {
  const router = useRouter();
  // "Fix and resend": the refused school this form reopens.
  const registrationId = useSearchParams().get("registration");
  const vm = useCountySchoolRegistrationViewModel();
  const context = useViewModel(vm.store, (s) => s.context);
  const registration = useViewModel(vm.store, (s) => s.registration);
  const submitting = useViewModel(vm.store, (s) => s.submitting);
  const [currentStep, setCurrentStep] = useState(1);
  const [codeClash, setCodeClash] = useState<string | null>(null);

  useEffect(() => {
    void vm.loadContext();
    if (registrationId) void vm.loadRegistration(registrationId);
  }, [vm, registrationId]);

  const districts =
    context.status === "success" || context.status === "refreshing"
      ? context.data.districts
      : [];
  const resubmitting =
    registrationId &&
    (registration.status === "success" || registration.status === "refreshing") &&
    registration.data.id === registrationId
      ? registration.data
      : null;

  const [formData, setFormData] = useState<SchoolFormData>({
    schoolName: "",
    district: "",
    levels: [],
    ownership: "GOVERNMENT",
    emisCode: "",
    principalName: "",
    phone: "",
    email: "",
    waecCode: "",
    address: "",
    communityTown: "",
    establishedYear: "",
    isBoarding: false,
    isUrban: false,
    accessMode: "",
    contactPhone: "",
    contactPersonPhone: "",
    numBuildings: "",
    numClassrooms: "",
    numChairs: "",
    numBenches: "",
    numDesks: "",
    numTables: "",
    numBathrooms: "",
    hasWaterAccess: false,
    waterSource: "",
    nursery: emptyGenderCount(),
    k1: emptyGenderCount(),
    k2: emptyGenderCount(),
    grade1: emptyGenderCount(),
    grade2: emptyGenderCount(),
    grade3: emptyGenderCount(),
    grade4: emptyGenderCount(),
    grade5: emptyGenderCount(),
    grade6: emptyGenderCount(),
    teachersPrimary: emptyGenderCount(),
    teachersMiddle: emptyGenderCount(),
    teachersSenior: emptyGenderCount(),
    hasLibrary: false,
    hasKitchen: false,
    hasCafeteria: false,
    hasSportsField: false,
    hasSportsActivities: false,
    hasAuditorium: false,
    hasElectricity: false,
    hasComputerLab: false,
    hasClinic: false,
    hasSafeWater: false,
    hasWash: false,
    hasTextbooks: false,
    hasCurriculum: false,
    isSpacious: false,
    isVentilated: false,
    isWellLighted: false,
    hasMoeSupport: false,
    partnerOrganization: "",
    hasPTA: false,
    accuracyDeclaration: false,
    complianceAgreement: false,
    inspectionConsent: false,
  });

  const set =
    (field: keyof SchoolFormData) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const { type } = e.target;
      const value =
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : e.target.value;
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const handleLevelChange = (level: InstitutionLevel, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      levels: checked
        ? [...prev.levels, level]
        : prev.levels.filter((l) => l !== level),
    }));
  };

  const isStep1Valid =
    formData.schoolName.trim() !== "" &&
    formData.district !== "" &&
    formData.levels.length > 0;

  // Desktop-only checks: what the server would refuse days later, offline.
  const principalNameIssue = formData.principalName.trim()
    ? principalNameError(formData.principalName)
    : null;
  const emailIssue = formData.email.trim() ? emailError(formData.email) : null;
  const establishedYearIssue = establishedYearError(formData.establishedYear);
  const countIssues = Object.fromEntries(
    COUNT_FIELDS.map((field) => [field, countError(formData[field])]),
  ) as Record<CountField, string | null>;
  const laterStepsValid =
    !establishedYearIssue && COUNT_FIELDS.every((field) => !countIssues[field]);

  const isStep2Valid =
    formData.principalName.trim() !== "" &&
    formData.email.trim() !== "" &&
    !principalNameIssue &&
    !emailIssue;

  // Prefill once from the refused school "Fix and resend" reopened. A
  // district that is gone (removed or deactivated) is left empty, so step 1
  // asks for a new one.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  useEffect(() => {
    if (!resubmitting || context.status !== "success" || prefilledFor === resubmitting.id) return;
    setPrefilledFor(resubmitting.id);
    setFormData((prev) => ({
      ...prev,
      ...formFromPayload(
        resubmitting.payload,
        context.data.districts.map((d) => d.id),
      ),
    }));
  }, [resubmitting, context, prefilledFor]);

  const buildInput = (): SchoolRegistrationInput => {
    const toInt = (s: string) => (s ? parseInt(s) || undefined : undefined);
    const toGender = (g: GenderCount) => ({
      male: parseInt(g.male) || 0,
      female: parseInt(g.female) || 0,
      total: (parseInt(g.male) || 0) + (parseInt(g.female) || 0),
    });

    // The web's payload; the device adds the code and the county when it saves.
    const schoolData = {
      name: formData.schoolName,
      type: "SCHOOL" as const,
      levels: formData.levels,
      ownership: formData.ownership || "GOVERNMENT",
      districtId: formData.district,
      address: formData.address,
      communityTown: formData.communityTown || undefined,
      isActive: true,
      // Government template fields
      emisCode: formData.emisCode || undefined,
      waecCode: formData.waecCode || undefined,
      isBoarding: formData.isBoarding,
      isUrban: formData.isUrban,
      contactPhone: formData.contactPhone || undefined,
      establishedYear: toInt(formData.establishedYear),
      accessMode: (formData.accessMode as AccessMode) || undefined,
      principalName: formData.principalName || undefined,
      contactPersonPhone: formData.contactPersonPhone || undefined,
      numBuildings: toInt(formData.numBuildings),
      numClassrooms: toInt(formData.numClassrooms),
      numChairs: toInt(formData.numChairs),
      numBenches: toInt(formData.numBenches),
      numDesks: toInt(formData.numDesks),
      numTables: toInt(formData.numTables),
      numBathrooms: toInt(formData.numBathrooms),
      hasWaterAccess: formData.hasWaterAccess,
      waterSource: formData.waterSource || undefined,
      hasMoeSupport: formData.hasMoeSupport,
      partnerOrganization: formData.partnerOrganization || undefined,
      hasPTA: formData.hasPTA,
      hasLibrary: formData.hasLibrary,
      hasKitchen: formData.hasKitchen,
      hasCafeteria: formData.hasCafeteria,
      hasSportsField: formData.hasSportsField,
      hasSportsActivities: formData.hasSportsActivities,
      hasAuditorium: formData.hasAuditorium,
      hasElectricity: formData.hasElectricity,
      hasComputerLab: formData.hasComputerLab,
      hasClinic: formData.hasClinic,
      hasSafeWater: formData.hasSafeWater,
      hasWash: formData.hasWash,
      hasTextbooks: formData.hasTextbooks,
      hasCurriculum: formData.hasCurriculum,
      isSpacious: formData.isSpacious,
      isVentilated: formData.isVentilated,
      isWellLighted: formData.isWellLighted,
      admins:
        formData.email && formData.principalName
          ? [
              {
                email: formData.email,
                firstName:
                  formData.principalName.split(" ")[0] ||
                  formData.principalName,
                lastName:
                  formData.principalName.split(" ").slice(1).join(" ") ||
                  formData.principalName.split(" ")[0],
              },
            ]
          : [],
      metadata: {
        enrollmentStats: {
          nursery: toGender(formData.nursery),
          k1: toGender(formData.k1),
          k2: toGender(formData.k2),
          grade1: toGender(formData.grade1),
          grade2: toGender(formData.grade2),
          grade3: toGender(formData.grade3),
          grade4: toGender(formData.grade4),
          grade5: toGender(formData.grade5),
          grade6: toGender(formData.grade6),
        },
        teacherStats: {
          primary: toGender(formData.teachersPrimary),
          middleSchool: toGender(formData.teachersMiddle),
          seniorHigh: toGender(formData.teachersSenior),
        },
      },
    };
    return schoolData as SchoolRegistrationInput;
  };

  /** Fix and resend of a spreadsheet row keeps what the form does not show
   * (e.g. the row's phone) and adds no zero statistics the admin never entered. */
  const resubmitInput = (stored: SchoolRegistrationPayload): SchoolRegistrationInput => {
    const built = buildInput();
    const { code: _code, countyId: _countyId, ...rest } = stored;
    void _code;
    void _countyId;
    const statsEntered = STAT_FIELDS.some(
      (field) => formData[field].male !== "" || formData[field].female !== "",
    );
    return {
      ...rest,
      ...built,
      metadata: { ...rest.metadata, ...(statsEntered ? built.metadata : {}) },
    };
  };

  /** Save and the online wait are one action: the buttons stay disabled until
   * the page has shown the outcome (a second click must not save again). */
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const isLoading = submitting || saving;
  const submitSchool = async () => {
    if (savingRef.current || !isStep1Valid || !isStep2Valid || !laterStepsValid) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await saveSchool();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const saveSchool = async () => {
    setCodeClash(null);
    const result = resubmitting
      ? await vm.resubmit({
          id: resubmitting.id,
          school:
            resubmitting.source === "bulk"
              ? resubmitInput(resubmitting.payload)
              : buildInput(),
        })
      : await vm.register({ source: "form", schools: [buildInput()] });
    if (!result) return;
    if (result.status === "code-clash") {
      setCodeClash(result.clashes[0]?.existingName ?? "");
      setCurrentStep(1);
      return;
    }
    if (result.status === "no-county") {
      await showError(
        "This device has not finished syncing your county yet. Connect once and try again.",
        "Registration Failed",
      );
      return;
    }
    if (result.status === "not-found") {
      await showError("This school can no longer be changed.");
      router.push("/government/county/schools");
      return;
    }

    const [saved] = await countyBridge
      .settleSchoolRegistrations(result.ids, SETTLE_MS)
      .catch(() => []);
    const outcome = settleOne(saved);
    if (outcome.kind === "waiting") {
      await showSuccess(SAVED_OFFLINE, "Saved");
      router.push("/government/county/schools");
      return;
    }
    acknowledgeRegistrations(result.ids);
    if (outcome.kind === "accepted") {
      if (outcome.login) await showCredentials(outcome.login);
      router.push("/government/county/schools");
      return;
    }
    // Refused at once: the admin fixes it right here, as on the web. A new
    // school is removed so it does not also linger red; a school being fixed
    // stays (it is rejected again) so the next Save resubmits it.
    if (!resubmitting) await vm.discard(result.ids[0]!);
    await showError(outcome.message, "Registration Failed");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSchool();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/government/county/schools")}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Schools
          </button>
          <h1 className="text-3xl font-bold text-neutral-dark">
            Register New School
          </h1>
          <p className="text-gray-600 mt-2">
            Steps 1 and 2 are required. All other steps capture data from the
            official MoE school profile template.
          </p>
        </div>

        <div className="flex gap-8">
          {/* Vertical Progress Indicator */}
          <div className="w-64 flex-shrink-0">
            <Card className="sticky top-8">
              <h2 className="text-lg font-semibold text-neutral-dark mb-6">
                Progress
              </h2>
              <div className="space-y-1">
                {STEPS.map((step, index) => (
                  <div key={step.number}>
                    <div
                      className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                        currentStep === step.number
                          ? "bg-sky-50 border-l-4 border-sky-700"
                          : currentStep > step.number
                            ? "bg-green-50 border-l-4 border-green-500"
                            : "bg-white border-l-4 border-transparent"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                          currentStep === step.number
                            ? "bg-sky-700 text-white"
                            : currentStep > step.number
                              ? "bg-green-500 text-white"
                              : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {currentStep > step.number ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          step.number
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            currentStep === step.number
                              ? "text-sky-700"
                              : currentStep > step.number
                                ? "text-green-700"
                                : "text-gray-600"
                          }`}
                        >
                          {step.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {step.description}
                        </p>
                      </div>
                    </div>
                    {index < STEPS.length - 1 && (
                      <div
                        className={`ml-7 h-6 w-0.5 ${
                          currentStep > step.number
                            ? "bg-green-500"
                            : "bg-gray-200"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <form onSubmit={handleSubmit}>
              {/* ── Step 1: School Identity ── */}
              {currentStep === 1 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-6">
                    School Identity
                  </h2>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        School Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.schoolName}
                        onChange={set("schoolName")}
                        className={inputCls}
                        placeholder="Enter full school name"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          EMIS Code
                        </label>
                        <input
                          type="text"
                          value={formData.emisCode}
                          onChange={set("emisCode")}
                          className={inputCls}
                          placeholder="e.g. LR-MONT-001"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Government EMIS unique identifier
                        </p>
                        {codeClash !== null && (
                          <FieldError message={`This school code already exists: ${codeClash}`} />
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          School Ownership / Type
                        </label>
                        <select
                          value={formData.ownership}
                          onChange={set("ownership")}
                          className={inputCls}
                        >
                          <option value="GOVERNMENT">
                            Government / Public
                          </option>
                          <option value="PRIVATE">Private</option>
                          <option value="MISSION">Mission / Religious</option>
                          <option value="COMMUNITY">Community</option>
                          <option value="NGO">NGO</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        District <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.district}
                        onChange={set("district")}
                        className={inputCls}
                        required
                      >
                        <option value="">Select District</option>
                        {districts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        School Levels <span className="text-red-500">*</span>
                      </label>
                      {formData.levels.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {formData.levels.map((l) => (
                            <span
                              key={l}
                              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-sky-100 text-sky-700"
                            >
                              {l.replace("_", " ")}
                              <button
                                type="button"
                                onClick={() => handleLevelChange(l, false)}
                                className="ml-2 text-sky-600 hover:text-sky-800"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                          {
                            level: InstitutionLevel.PRE_PRIMARY,
                            label: "Pre-Primary / ECE",
                            sub: "Nursery, K1, K2",
                          },
                          {
                            level: InstitutionLevel.PRIMARY,
                            label: "Primary",
                            sub: "Grade 1–6",
                          },
                          {
                            level: InstitutionLevel.SECONDARY,
                            label: "Secondary",
                            sub: "Middle & Senior High",
                          },
                        ].map(({ level, label, sub }) => (
                          <label
                            key={level}
                            className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.levels.includes(level)}
                              onChange={(e) =>
                                handleLevelChange(level, e.target.checked)
                              }
                              className={checkboxCls}
                            />
                            <div>
                              <span className="text-sm font-medium text-gray-700">
                                {label}
                              </span>
                              <p className="text-xs text-gray-500">{sub}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      {formData.levels.length === 0 && (
                        <p className="text-xs text-red-500 mt-1">
                          At least one level must be selected
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Step 2: Admin Contact ── */}
              {currentStep === 2 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-2">
                    Admin Contact
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    These details create the school admin account. The admin
                    will receive login credentials and can update their profile
                    after first sign-in.
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Principal / Head Teacher Name{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.principalName}
                          onChange={set("principalName")}
                          className={withError(principalNameIssue)}
                          placeholder="Full name"
                          required
                        />
                        <FieldError message={principalNameIssue} />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email Address <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={set("email")}
                          className={withError(emailIssue)}
                          placeholder="school@example.com"
                          required
                        />
                        <FieldError message={emailIssue} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Admin Phone Number
                        </label>
                        <PhoneInput
                          flags={flags}
                          defaultCountry="LR"
                          value={formData.phone}
                          onChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              phone: value || "",
                            }))
                          }
                          className="w-full"
                          placeholder="771989967"
                          numberInputProps={{ className: inputCls }}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          WAEC Code
                        </label>
                        <input
                          type="text"
                          value={formData.waecCode}
                          onChange={set("waecCode")}
                          className={inputCls}
                          placeholder="WAEC school code"
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Step 3: Location & Classification ── */}
              {currentStep === 3 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-2">
                    Location & Classification
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    All fields on this step are optional.
                  </p>
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Specific Location / Community
                        </label>
                        <input
                          type="text"
                          value={formData.communityTown}
                          onChange={set("communityTown")}
                          className={inputCls}
                          placeholder="Community or town name"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Year of Establishment
                        </label>
                        <input
                          type="number"
                          value={formData.establishedYear}
                          onChange={set("establishedYear")}
                          className={withError(establishedYearIssue)}
                          min="1800"
                          max={new Date().getFullYear()}
                          placeholder="YYYY"
                        />
                        <FieldError message={establishedYearIssue} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Physical Address
                      </label>
                      <textarea
                        rows={2}
                        value={formData.address}
                        onChange={set("address")}
                        className={inputCls}
                        placeholder="Street, community, district"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Accessible By
                        </label>
                        <select
                          value={formData.accessMode}
                          onChange={set("accessMode")}
                          className={inputCls}
                        >
                          <option value="">Select</option>
                          <option value="VEHICLE">Vehicle</option>
                          <option value="BIKE">Bike</option>
                          <option value="FOOT">Foot</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          School Contact Phone
                        </label>
                        <input
                          type="text"
                          value={formData.contactPhone}
                          onChange={set("contactPhone")}
                          className={inputCls}
                          placeholder="School phone number"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Principal Contact Phone
                        </label>
                        <input
                          type="text"
                          value={formData.contactPersonPhone}
                          onChange={set("contactPersonPhone")}
                          className={inputCls}
                          placeholder="Contact for person in charge"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isBoarding}
                          onChange={set("isBoarding")}
                          className={checkboxCls}
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-700">
                            Boarding School
                          </span>
                          <p className="text-xs text-gray-500">
                            School provides student accommodation
                          </p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isUrban}
                          onChange={set("isUrban")}
                          className={checkboxCls}
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-700">
                            Urban School
                          </span>
                          <p className="text-xs text-gray-500">
                            Uncheck for rural school
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Step 4: Physical Infrastructure ── */}
              {currentStep === 4 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-2">
                    Physical Infrastructure
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    All fields on this step are optional.
                  </p>
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { field: "numBuildings" as const, label: "Buildings" },
                        {
                          field: "numClassrooms" as const,
                          label: "Classrooms",
                        },
                        { field: "numChairs" as const, label: "Chairs" },
                        { field: "numBenches" as const, label: "Benches" },
                        { field: "numDesks" as const, label: "Desks" },
                        { field: "numTables" as const, label: "Tables" },
                        { field: "numBathrooms" as const, label: "Bathrooms" },
                      ].map(({ field, label }) => (
                        <div key={field}>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            # of {label}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={formData[field] as string}
                            onChange={set(field)}
                            className={withError(countIssues[field])}
                            placeholder="0"
                          />
                          <FieldError message={countIssues[field]} />
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">
                        Water Access
                      </p>
                      <label className="flex items-center gap-3 mb-3">
                        <input
                          type="checkbox"
                          checked={formData.hasWaterAccess}
                          onChange={set("hasWaterAccess")}
                          className={checkboxCls}
                        />
                        <span className="text-sm text-gray-700">
                          Water is available at this school
                        </span>
                      </label>
                      {formData.hasWaterAccess && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Water Source
                          </label>
                          <input
                            type="text"
                            value={formData.waterSource}
                            onChange={set("waterSource")}
                            className={inputCls}
                            placeholder="e.g. Borehole, Tap, River, Rain"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Step 5: Enrollment Statistics ── */}
              {currentStep === 5 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-2">
                    Enrollment Statistics
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    Annual snapshot data — all fields are optional.
                  </p>

                  <div className="space-y-6">
                    {/* ECE Enrollment */}
                    {formData.levels.includes(InstitutionLevel.PRE_PRIMARY) && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
                          ECE / Pre-Primary Enrollment
                        </h3>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                          <span className="text-xs text-gray-500 font-medium">
                            Grade
                          </span>
                          <span className="text-xs text-gray-500 font-medium text-center">
                            Male
                          </span>
                          <span className="text-xs text-gray-500 font-medium text-center">
                            Female
                          </span>
                          <span className="text-xs text-gray-500 font-medium text-center">
                            Total
                          </span>
                        </div>
                        <div className="space-y-2">
                          <GenderRow
                            label="Nursery"
                            value={formData.nursery}
                            onChange={(v) =>
                              setFormData((p) => ({ ...p, nursery: v }))
                            }
                          />
                          <GenderRow
                            label="KG 1"
                            value={formData.k1}
                            onChange={(v) =>
                              setFormData((p) => ({ ...p, k1: v }))
                            }
                          />
                          <GenderRow
                            label="KG 2"
                            value={formData.k2}
                            onChange={(v) =>
                              setFormData((p) => ({ ...p, k2: v }))
                            }
                          />
                        </div>
                      </div>
                    )}

                    {/* Primary Enrollment */}
                    {formData.levels.includes(InstitutionLevel.PRIMARY) && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
                          Primary Enrollment
                        </h3>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                          <span className="text-xs text-gray-500 font-medium">
                            Grade
                          </span>
                          <span className="text-xs text-gray-500 font-medium text-center">
                            Male
                          </span>
                          <span className="text-xs text-gray-500 font-medium text-center">
                            Female
                          </span>
                          <span className="text-xs text-gray-500 font-medium text-center">
                            Total
                          </span>
                        </div>
                        <div className="space-y-2">
                          {(
                            [
                              ["Grade 1", "grade1"],
                              ["Grade 2", "grade2"],
                              ["Grade 3", "grade3"],
                              ["Grade 4", "grade4"],
                              ["Grade 5", "grade5"],
                              ["Grade 6", "grade6"],
                            ] as [string, string][]
                          ).map(([label, key]) => (
                            <GenderRow
                              key={key}
                              label={label}
                              value={
                                formData[
                                  key as keyof SchoolFormData
                                ] as GenderCount
                              }
                              onChange={(v) =>
                                setFormData((p) => ({ ...p, [key]: v }))
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Teacher Statistics */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">
                        Teacher Statistics
                      </h3>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        <span className="text-xs text-gray-500 font-medium">
                          Level
                        </span>
                        <span className="text-xs text-gray-500 font-medium text-center">
                          Male
                        </span>
                        <span className="text-xs text-gray-500 font-medium text-center">
                          Female
                        </span>
                        <span className="text-xs text-gray-500 font-medium text-center">
                          Total
                        </span>
                      </div>
                      <div className="space-y-2">
                        <GenderRow
                          label="Primary"
                          value={formData.teachersPrimary}
                          onChange={(v) =>
                            setFormData((p) => ({ ...p, teachersPrimary: v }))
                          }
                        />
                        <GenderRow
                          label="Middle School"
                          value={formData.teachersMiddle}
                          onChange={(v) =>
                            setFormData((p) => ({ ...p, teachersMiddle: v }))
                          }
                        />
                        <GenderRow
                          label="Senior High"
                          value={formData.teachersSenior}
                          onChange={(v) =>
                            setFormData((p) => ({ ...p, teachersSenior: v }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Step 6: Facilities & Support ── */}
              {currentStep === 6 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-2">
                    Facilities & School Support
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    All fields on this step are optional.
                  </p>

                  <div className="space-y-6">
                    {/* Facilities grid */}
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-3">
                        Physical Facilities
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          {
                            field: "hasLibrary" as const,
                            label: "Library / Reading Room",
                          },
                          {
                            field: "hasKitchen" as const,
                            label: "Kitchen / Food Storage",
                          },
                          {
                            field: "hasCafeteria" as const,
                            label: "Cafeteria",
                          },
                          {
                            field: "hasSportsField" as const,
                            label: "Sports Facilities",
                          },
                          {
                            field: "hasSportsActivities" as const,
                            label: "Sports Activities",
                          },
                          {
                            field: "hasAuditorium" as const,
                            label: "Auditorium",
                          },
                          {
                            field: "hasElectricity" as const,
                            label: "Electricity",
                          },
                          {
                            field: "hasComputerLab" as const,
                            label: "Computer Lab",
                          },
                          {
                            field: "hasClinic" as const,
                            label: "Health Clinic",
                          },
                          {
                            field: "hasSafeWater" as const,
                            label: "Safe Drinking Water",
                          },
                          {
                            field: "hasWash" as const,
                            label: "WASH Facilities",
                          },
                          {
                            field: "hasTextbooks" as const,
                            label: "Textbooks",
                          },
                          {
                            field: "hasCurriculum" as const,
                            label: "Curriculum Materials",
                          },
                        ].map(({ field, label }) => (
                          <label
                            key={field}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData[field] as boolean}
                              onChange={set(field)}
                              className={checkboxCls}
                            />
                            <span className="text-sm text-gray-700">
                              {label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Learning Atmosphere */}
                    <div className="border-t border-gray-100 pt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">
                        Learning Atmosphere
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                          { field: "isSpacious" as const, label: "Spacious" },
                          {
                            field: "isVentilated" as const,
                            label: "Well-Ventilated",
                          },
                          {
                            field: "isWellLighted" as const,
                            label: "Well-Lighted",
                          },
                        ].map(({ field, label }) => (
                          <label
                            key={field}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData[field] as boolean}
                              onChange={set(field)}
                              className={checkboxCls}
                            />
                            <span className="text-sm text-gray-700">
                              {label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* School Support */}
                    <div className="border-t border-gray-100 pt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">
                        School Support
                      </p>
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.hasMoeSupport}
                            onChange={set("hasMoeSupport")}
                            className={checkboxCls}
                          />
                          <span className="text-sm text-gray-700">
                            Receives MOE Support
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.hasPTA}
                            onChange={set("hasPTA")}
                            className={checkboxCls}
                          />
                          <span className="text-sm text-gray-700">
                            Has PTA (Parent-Teacher Association)
                          </span>
                        </label>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Partner Organization
                          </label>
                          <input
                            type="text"
                            value={formData.partnerOrganization}
                            onChange={set("partnerOrganization")}
                            className={inputCls}
                            placeholder="Name of supporting organization (if any)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Step 7: Declaration & Review ── */}
              {currentStep === 7 && (
                <Card>
                  <h2 className="text-xl font-semibold text-neutral-dark mb-2">
                    Declaration & Final Review
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    All fields on this step are optional.
                  </p>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-5">
                    <h4 className="font-semibold text-slate-900 mb-3">
                      Review Summary
                    </h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-gray-500">School:</span>
                        <span className="ml-2 font-medium">
                          {formData.schoolName || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">EMIS Code:</span>
                        <span className="ml-2 font-medium">
                          {formData.emisCode || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Levels:</span>
                        <span className="ml-2 font-medium">
                          {formData.levels.join(", ") || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Ownership:</span>
                        <span className="ml-2 font-medium">
                          {formData.ownership || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Principal:</span>
                        <span className="ml-2 font-medium">
                          {formData.principalName || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Location:</span>
                        <span className="ml-2 font-medium">
                          {formData.isUrban ? "Urban" : "Rural"}{" "}
                          {formData.isBoarding ? "· Boarding" : "· Day"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.accuracyDeclaration}
                        onChange={set("accuracyDeclaration")}
                        className="w-5 h-5 text-sky-700 focus:ring-sky-700 rounded mt-0.5"
                      />
                      <span className="text-sm text-gray-700">
                        I declare that all information provided is accurate and
                        complete
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.complianceAgreement}
                        onChange={set("complianceAgreement")}
                        className="w-5 h-5 text-sky-700 focus:ring-sky-700 rounded mt-0.5"
                      />
                      <span className="text-sm text-gray-700">
                        I agree to comply with all MoE regulations and standards
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.inspectionConsent}
                        onChange={set("inspectionConsent")}
                        className="w-5 h-5 text-sky-700 focus:ring-sky-700 rounded mt-0.5"
                      />
                      <span className="text-sm text-gray-700">
                        I consent to school inspections and verification visits
                      </span>
                    </label>
                  </div>
                </Card>
              )}

              {/* ── Navigation Buttons ── */}
              <div className="flex justify-between mt-6">
                <div>
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      onClick={() => setCurrentStep((s) => s - 1)}
                      disabled={isLoading}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Previous
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={() => router.push("/government/county/schools")}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>

                  {currentStep === 1 && (
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      onClick={() => setCurrentStep(2)}
                      disabled={!isStep1Valid}
                    >
                      Next
                      <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                    </Button>
                  )}

                  {currentStep === 2 && (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        onClick={submitSchool}
                        disabled={!isStep2Valid || isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Submitting...
                          </>
                        ) : (
                          "Submit & Finish"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={() => setCurrentStep(3)}
                        disabled={!isStep2Valid || isLoading}
                      >
                        Continue with Optional Details
                        <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                      </Button>
                    </>
                  )}

                  {currentStep > 2 && currentStep < STEPS.length && (
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      onClick={() => setCurrentStep((s) => s + 1)}
                    >
                      Next
                      <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                    </Button>
                  )}

                  {currentStep === STEPS.length && (
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      disabled={isLoading || !laterStepsValid}
                    >
                      {isLoading ? (
                        <>
                          <Spinner size="sm" className="mr-2" />
                          Submitting...
                        </>
                      ) : (
                        "Submit Registration"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
