"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Button, Card, Spinner } from "@nemis-desktop/ui";
import {
  ArrowLeft,
  Download,
  Upload,
  Trash2,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import type { SchoolRegistrationInput } from "@nemis-desktop/types";
import { useCountySchoolRegistrationViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { countyBridge } from "@/services/nemis-bridge/county";
import { CopyButton } from "@/components/county/schools/registration/CopyButton";
import { emailError, principalNameError } from "@/components/county/schools/registration/server-rules";
import { settleMany } from "@/components/county/schools/registration/settle";
import { acknowledgeRegistrations } from "@/components/county/schools/registration/notices";

/** The online wait after Import (spec §5.5). */
const SETTLE_MS = 30_000;

/** portal-web's BulkCreateResult shape (the done step reads it), plus the
 * schools still waiting on this device. */
interface BulkCreateResult {
  totalRequested: number;
  created: number;
  failed: number;
  waiting: number;
  results: {
    created: Array<{ index: number; name: string; adminCredential?: { email: string; defaultPassword: string } }>;
    failed: Array<{ index: number; name: string; error: string }>;
  };
}

const savedOfflineMessage = (n: number) =>
  `${n} school${n === 1 ? "" : "s"} saved; they'll be sent when you're back online.`;

type Level = "PRE_PRIMARY" | "PRIMARY" | "SECONDARY";

interface BulkRow {
  id: string;
  schoolName: string;
  districtName: string;
  levels: Level[];
  principalName: string;
  email: string;
  phone: string;
  address: string;
  ownership: string;
  emisCode: string;
  isUrban: boolean;
  errors: Record<string, string>;
}

type Step = "upload" | "review" | "done";

const LEVEL_OPTIONS: { value: Level; short: string; label: string }[] = [
  { value: "PRE_PRIMARY", short: "PP", label: "Pre-Primary" },
  { value: "PRIMARY", short: "P", label: "Primary" },
  { value: "SECONDARY", short: "S", label: "Secondary" },
];

const makeId = () => Math.random().toString(36).slice(2, 10);

const emptyRow = (): BulkRow => ({
  id: makeId(),
  schoolName: "",
  districtName: "",
  levels: [],
  principalName: "",
  email: "",
  phone: "",
  address: "",
  ownership: "",
  emisCode: "",
  isUrban: false,
  errors: {},
});

function validateRow(
  row: BulkRow,
  districtNames: string[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!row.schoolName.trim()) errors.schoolName = "Required";
  const matchedDistrict = districtNames.find(
    (n) => n.toLowerCase() === row.districtName.trim().toLowerCase(),
  );
  if (!row.districtName.trim()) {
    errors.districtName = "Required";
  } else if (!matchedDistrict) {
    errors.districtName = "Must match a district in this county";
  }
  if (row.levels.length === 0) errors.levels = "Select at least one";
  // Desktop-only: the server's own rules (AdminUserDto), caught before saving offline.
  const principalIssue = row.principalName.trim() ? principalNameError(row.principalName) : "Required";
  if (principalIssue) errors.principalName = principalIssue;
  const emailIssue = emailError(row.email);
  if (emailIssue) errors.email = emailIssue;
  return errors;
}

function parseLevels(raw: string): Level[] {
  const valid = new Set<string>(["PRE_PRIMARY", "PRIMARY", "SECONDARY"]);
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim().toUpperCase().replace(/ /g, "_"))
    .filter((s) => valid.has(s)) as Level[];
}

export default function BulkImportPage() {
  const router = useRouter();
  const vm = useCountySchoolRegistrationViewModel();
  const context = useViewModel(vm.store, (s) => s.context);
  const isLoading = useViewModel(vm.store, (s) => s.submitting);
  useEffect(() => {
    void vm.loadContext();
  }, [vm]);
  const districts =
    context.status === "success" || context.status === "refreshing"
      ? context.data.districts
      : [];

  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [result, setResult] = useState<BulkCreateResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const districtNames = districts.map((d) => d.name);

  // ── Template download ──────────────────────────────────────────────────────

  const downloadTemplate = useCallback(() => {
    const headers = [
      "School Name *",
      "District Name *",
      "Levels * (PRE_PRIMARY,PRIMARY,SECONDARY)",
      "Principal Name *",
      "Admin Email *",
      "Phone",
      "Address",
      "Ownership (GOVERNMENT/PRIVATE/MISSION/COMMUNITY/NGO)",
      "EMIS Code",
      "Is Urban (YES/NO)",
    ];
    const example = [
      "Example High School",
      districts[0]?.name ?? "Monrovia District",
      "PRIMARY,SECONDARY",
      "Jane Doe",
      "jane@example.com",
      "+231771234567",
      "123 Main St, Monrovia",
      "GOVERNMENT",
      "LR-MONT-001",
      "YES",
    ];

    const schoolsSheet = XLSX.utils.aoa_to_sheet([headers, example]);
    schoolsSheet["!cols"] = headers.map(() => ({ wch: 28 }));

    const districtSheet = XLSX.utils.aoa_to_sheet([
      ["Available Districts (copy exact name into District Name column)"],
      ...districts.map((d) => [d.name]),
    ]);

    const refSheet = XLSX.utils.aoa_to_sheet([
      ["Valid Levels", "Valid Ownership"],
      ["PRE_PRIMARY", "GOVERNMENT"],
      ["PRIMARY", "PRIVATE"],
      ["SECONDARY", "MISSION"],
      ["", "COMMUNITY"],
      ["", "NGO"],
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, schoolsSheet, "Schools");
    XLSX.utils.book_append_sheet(wb, districtSheet, "Districts");
    XLSX.utils.book_append_sheet(wb, refSheet, "Reference");
    XLSX.writeFile(wb, "school-import-template.xlsx");
  }, [districts]);

  // ── File parsing ───────────────────────────────────────────────────────────

  const parseFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]!]!;
          const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
            defval: "",
          });

          const parsed: BulkRow[] = raw
            .filter((r) => {
              const name = String(
                r["School Name *"] ?? r["School Name"] ?? "",
              ).trim();
              return (
                name &&
                !name.startsWith("*") &&
                !name.toLowerCase().startsWith("example")
              );
            })
            .map((r) => {
              const rawOwnership = String(
                r["Ownership (GOVERNMENT/PRIVATE/MISSION/COMMUNITY/NGO)"] ??
                  r["Ownership (GOVERNMENT/PRIVATE/RELIGIOUS/NGO)"] ??
                  r["Ownership"] ??
                  "",
              )
                .trim()
                .toUpperCase();
              const isUrbanRaw = String(
                r["Is Urban (YES/NO)"] ?? r["Is Urban"] ?? "",
              )
                .trim()
                .toUpperCase();
              const row: BulkRow = {
                id: makeId(),
                schoolName: String(
                  r["School Name *"] ?? r["School Name"] ?? "",
                ).trim(),
                districtName: String(
                  r["District Name *"] ?? r["District Name"] ?? "",
                ).trim(),
                levels: parseLevels(
                  String(
                    r["Levels * (PRE_PRIMARY,PRIMARY,SECONDARY)"] ??
                      r["Levels"] ??
                      "",
                  ),
                ),
                principalName: String(
                  r["Principal Name *"] ?? r["Principal Name"] ?? "",
                ).trim(),
                email: String(
                  r["Admin Email *"] ?? r["Admin Email"] ?? r["Email"] ?? "",
                ).trim(),
                phone: String(r["Phone"] ?? "").trim(),
                address: String(r["Address"] ?? "").trim(),
                ownership:
                  rawOwnership === "RELIGIOUS" ? "MISSION" : rawOwnership,
                emisCode: String(r["EMIS Code"] ?? "").trim(),
                isUrban:
                  isUrbanRaw === "YES" ||
                  isUrbanRaw === "TRUE" ||
                  isUrbanRaw === "1",
                errors: {},
              };
              row.errors = validateRow(row, districtNames);
              return row;
            });

          if (parsed.length === 0) {
            alert(
              "No data rows found. Make sure you filled in the Schools sheet (the example row is ignored automatically).",
            );
            return;
          }

          setRows(parsed);
          setStep("review");
        } catch {
          alert("Could not read the file. Please use the downloaded template.");
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [districtNames],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  // ── Row editing ────────────────────────────────────────────────────────────

  const updateRow = (
    id: string,
    patch: Partial<Omit<BulkRow, "id" | "errors">>,
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        updated.errors = validateRow(updated, districtNames);
        return updated;
      }),
    );
  };

  const deleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow()]);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const validRows = rows.filter((r) => Object.keys(r.errors).length === 0);

  const handleSubmit = async () => {
    if (validRows.length === 0 || isLoading) return;

    // The web's payload; the device adds the (random) code and the county when it saves.
    const institutions = validRows.map((row): SchoolRegistrationInput => {
      const district = districts.find(
        (d) => d.name.toLowerCase() === row.districtName.trim().toLowerCase(),
      )!;
      const parts = row.principalName.trim().split(/\s+/);

      return {
        name: row.schoolName.trim(),
        type: "SCHOOL" as const,
        levels: row.levels,
        districtId: district.id,
        address: row.address || undefined,
        ownership: (row.ownership || "GOVERNMENT") as
          | "GOVERNMENT"
          | "PRIVATE"
          | "MISSION"
          | "COMMUNITY"
          | "NGO",
        emisCode: row.emisCode || undefined,
        isUrban: row.isUrban,
        principalName: row.principalName || undefined,
        isActive: true,
        admins: row.email
          ? [
              {
                email: row.email.trim(),
                firstName: parts[0] ?? row.principalName,
                lastName: parts.slice(1).join(" ") || parts[0] || "Admin",
              },
            ]
          : [],
        metadata: {
          principalName: row.principalName,
          phone: row.phone,
        },
      };
    });

    const saved = await vm.register({ source: "bulk", schools: institutions });
    if (!saved) return;
    if (saved.status !== "saved") {
      alert("This device has not finished syncing your county yet. Connect once and try again.");
      return;
    }

    const states = await countyBridge
      .settleSchoolRegistrations(saved.ids, SETTLE_MS)
      .catch(() => []);
    const byId = new Map(states.map((r) => [r.id, r]));
    const settled = settleMany(saved.ids.map((id) => byId.get(id)).filter((r) => r !== undefined));
    const indexOf = new Map(saved.ids.map((id, index) => [id, index]));
    const nameAt = (id: string) => institutions[indexOf.get(id)!]!.name;
    acknowledgeRegistrations([...settled.created, ...settled.failed].map((r) => r.id));
    // A refused row goes back to review on "Retry Failed Rows", as on the web;
    // its registration must not also linger red on this device.
    for (const r of settled.failed) await vm.discard(r.id);

    const created = settled.created.map((r) => ({
      index: indexOf.get(r.id)!,
      name: nameAt(r.id),
      adminCredential: r.principalLogin
        ? { email: r.principalLogin.email, defaultPassword: r.principalLogin.password }
        : undefined,
    }));
    const failed = settled.failed.map((r) => ({
      index: indexOf.get(r.id)!,
      name: nameAt(r.id),
      error: r.syncError ?? "The server refused this school.",
    }));
    setResult({
      totalRequested: institutions.length,
      created: created.length,
      failed: failed.length,
      waiting: institutions.length - created.length - failed.length,
      results: { created, failed },
    });
    setStep("done");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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
            Bulk Import Schools
          </h1>
          <p className="text-gray-600 mt-2">
            Download the template, fill in the school details, upload the file,
            review and edit, then import.
          </p>
        </div>

        {/* ── STEP: UPLOAD ───────────────────────────────────────── */}
        {step === "upload" && (
          <div className="max-w-2xl">
            <Card className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Step 1 — Download Template
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                The template includes all available districts for your county
                and a reference sheet with valid values.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={downloadTemplate}
                disabled={districts.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Template (.xlsx)
              </Button>
            </Card>

            <Card>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Step 2 — Upload Filled Template
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Accepts <strong>.xlsx</strong> or <strong>.csv</strong> files.
                The example row in the template is automatically ignored.
              </p>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-gray-300 hover:border-primary/60 hover:bg-gray-50"
                }`}
              >
                <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  Drag & drop your file here, or click to browse
                </p>
                <p className="text-xs text-gray-500 mt-1">.xlsx or .csv</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </Card>
          </div>
        )}

        {/* ── STEP: REVIEW ───────────────────────────────────────── */}
        {step === "review" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  <span className="font-semibold text-green-700">
                    {validRows.length}
                  </span>{" "}
                  valid /{" "}
                  <span className="font-semibold text-red-600">
                    {rows.length - validRows.length}
                  </span>{" "}
                  with errors
                </span>
                <button
                  type="button"
                  onClick={() => setStep("upload")}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Upload a different file
                </button>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="secondary" onClick={addRow}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Row
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={validRows.length === 0 || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Importing...
                    </>
                  ) : (
                    `Import ${validRows.length} School${validRows.length !== 1 ? "s" : ""}`
                  )}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                      #
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[180px]">
                      School Name *
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[160px]">
                      District *
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                      Levels *
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[150px]">
                      Principal Name *
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[180px]">
                      Admin Email *
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => {
                    const hasErrors = Object.keys(row.errors).length > 0;
                    return (
                      <tr
                        key={row.id}
                        className={hasErrors ? "bg-red-50/40" : "bg-white"}
                      >
                        {/* # */}
                        <td className="px-3 py-2 text-gray-400 text-xs align-top pt-3">
                          {i + 1}
                        </td>

                        {/* School Name */}
                        <td className="px-3 py-2 align-top">
                          <input
                            type="text"
                            value={row.schoolName}
                            onChange={(e) =>
                              updateRow(row.id, { schoolName: e.target.value })
                            }
                            className={`w-full px-2 py-1.5 text-sm rounded border ${
                              row.errors.schoolName
                                ? "border-red-400 bg-red-50"
                                : "border-gray-300"
                            } focus:outline-none focus:ring-1 focus:ring-primary/40`}
                            placeholder="School name"
                          />
                          {row.errors.schoolName && (
                            <p className="text-xs text-red-500 mt-0.5">
                              {row.errors.schoolName}
                            </p>
                          )}
                        </td>

                        {/* District */}
                        <td className="px-3 py-2 align-top">
                          <select
                            value={row.districtName}
                            onChange={(e) =>
                              updateRow(row.id, {
                                districtName: e.target.value,
                              })
                            }
                            className={`w-full px-2 py-1.5 text-sm rounded border ${
                              row.errors.districtName
                                ? "border-red-400 bg-red-50"
                                : "border-gray-300"
                            } focus:outline-none focus:ring-1 focus:ring-primary/40`}
                          >
                            <option value="">Select district</option>
                            {districts.map((d) => (
                              <option key={d.id} value={d.name}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                          {row.errors.districtName && (
                            <p className="text-xs text-red-500 mt-0.5">
                              {row.errors.districtName}
                            </p>
                          )}
                        </td>

                        {/* Levels */}
                        <td className="px-3 py-2 align-top">
                          <div className="flex gap-1">
                            {LEVEL_OPTIONS.map((opt) => {
                              const selected = row.levels.includes(opt.value);
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  title={opt.label}
                                  onClick={() => {
                                    const next = selected
                                      ? row.levels.filter(
                                          (l) => l !== opt.value,
                                        )
                                      : [...row.levels, opt.value];
                                    updateRow(row.id, { levels: next });
                                  }}
                                  className={`px-2 py-1 text-xs rounded font-medium border transition-colors ${
                                    selected
                                      ? "bg-primary text-white border-primary"
                                      : "bg-white text-gray-600 border-gray-300 hover:border-primary/60"
                                  }`}
                                >
                                  {opt.short}
                                </button>
                              );
                            })}
                          </div>
                          {row.errors.levels && (
                            <p className="text-xs text-red-500 mt-0.5">
                              {row.errors.levels}
                            </p>
                          )}
                        </td>

                        {/* Principal Name */}
                        <td className="px-3 py-2 align-top">
                          <input
                            type="text"
                            value={row.principalName}
                            onChange={(e) =>
                              updateRow(row.id, {
                                principalName: e.target.value,
                              })
                            }
                            className={`w-full px-2 py-1.5 text-sm rounded border ${
                              row.errors.principalName
                                ? "border-red-400 bg-red-50"
                                : "border-gray-300"
                            } focus:outline-none focus:ring-1 focus:ring-primary/40`}
                            placeholder="Full name"
                          />
                          {row.errors.principalName && (
                            <p className="text-xs text-red-500 mt-0.5">
                              {row.errors.principalName}
                            </p>
                          )}
                        </td>

                        {/* Email */}
                        <td className="px-3 py-2 align-top">
                          <input
                            type="email"
                            value={row.email}
                            onChange={(e) =>
                              updateRow(row.id, { email: e.target.value })
                            }
                            className={`w-full px-2 py-1.5 text-sm rounded border ${
                              row.errors.email
                                ? "border-red-400 bg-red-50"
                                : "border-gray-300"
                            } focus:outline-none focus:ring-1 focus:ring-primary/40`}
                            placeholder="admin@school.lr"
                          />
                          {row.errors.email && (
                            <p className="text-xs text-red-500 mt-0.5">
                              {row.errors.email}
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2 text-center align-top pt-2.5">
                          {hasErrors ? (
                            <AlertCircle className="w-5 h-5 text-red-400 mx-auto" />
                          ) : (
                            <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                          )}
                        </td>

                        {/* Delete */}
                        <td className="px-3 py-2 align-top pt-2">
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id)}
                            className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
                            title="Remove row"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {rows.length === 0 && (
                <div className="py-12 text-center text-gray-500 text-sm">
                  No rows. Click &quot;Add Row&quot; to add schools manually.
                </div>
              )}
            </div>

            <div className="flex justify-between mt-4">
              <Button type="button" variant="secondary" onClick={addRow}>
                <Plus className="w-4 h-4 mr-1" />
                Add Row
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSubmit}
                disabled={validRows.length === 0 || isLoading}
              >
                {isLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Importing...
                  </>
                ) : (
                  `Import ${validRows.length} Valid School${validRows.length !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP: DONE ─────────────────────────────────────────── */}
        {step === "done" && result && result.results && (
          <div className="max-w-4xl">
            {/* Saved on this device, not answered yet (offline, or past the wait) */}
            {result.waiting > 0 && (
              <Card className="mb-6">
                <p className="text-sm font-medium text-gray-800">
                  {savedOfflineMessage(result.waiting)}
                </p>
              </Card>
            )}

            {/* Summary */}
            {result.created + result.failed > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="text-center">
                <p className="text-3xl font-bold text-gray-900">
                  {result.totalRequested}
                </p>
                <p className="text-sm text-gray-500 mt-1">Submitted</p>
              </Card>
              <Card className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {result.created}
                </p>
                <p className="text-sm text-gray-500 mt-1">Created</p>
              </Card>
              <Card className="text-center">
                <p className="text-3xl font-bold text-red-500">
                  {result.failed}
                </p>
                <p className="text-sm text-gray-500 mt-1">Failed</p>
              </Card>
            </div>
            )}

            {/* Admin credentials */}
            {result.results.created.some((c) => c.adminCredential) && (
              <Card className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  Admin Login Credentials
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Share these credentials with each school admin. They can
                  update their password from their dashboard.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                          School
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                          Email
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                          Default Password
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {result.results.created
                        .filter((c) => c.adminCredential)
                        .map((c) => (
                          <tr key={c.index} className="bg-white">
                            <td className="px-4 py-2 text-gray-900">
                              {c.name}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-gray-800">
                                  {c.adminCredential!.email}
                                </span>
                                <CopyButton text={c.adminCredential!.email} />
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-gray-800">
                                  {c.adminCredential!.defaultPassword}
                                </span>
                                <CopyButton
                                  text={c.adminCredential!.defaultPassword}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Failures */}
            {result.results.failed.length > 0 && (
              <Card className="mb-6">
                <h3 className="text-base font-semibold text-red-700 mb-1">
                  Failed Schools
                </h3>
                <div className="space-y-2 mt-3">
                  {result.results.failed.map((f) => (
                    <div
                      key={f.index}
                      className="flex items-start gap-2 p-3 bg-red-50 rounded-lg"
                    >
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-800">
                          {f.name || `Row ${f.index + 1}`}
                        </p>
                        <p className="text-xs text-red-600 mt-0.5">{f.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <div className="flex gap-3">
              {result.results.failed.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const failedIndexes = new Set(
                      result.results.failed.map((f) => f.index),
                    );
                    const failedNames = new Set(
                      result.results.failed.map((f) => f.name.toLowerCase()),
                    );
                    setRows((prev) =>
                      prev
                        .filter(
                          (r) =>
                            failedIndexes.has(prev.indexOf(r)) ||
                            failedNames.has(r.schoolName.toLowerCase()),
                        )
                        .map((r) => ({
                          ...r,
                          errors: validateRow(r, districtNames),
                        })),
                    );
                    setStep("review");
                    setResult(null);
                  }}
                >
                  Retry Failed Rows
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                onClick={() => router.push("/government/county/schools")}
              >
                Go to Schools List
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
