"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@nemis-desktop/ui";
import { AlertTriangle, ArrowLeft, Check, Download, Upload } from "lucide-react";
import type { CountyBulkCreateUsersResult, CountyBulkUserRow } from "@nemis-desktop/types";
import { useCountyUserOptionsViewModel } from "@/lib/presentation/hooks/county";
import { useConnectivityStore } from "@/lib/presentation/hooks/shared";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { parseIpcError } from "@/lib/errors/parseIpcError";
import { countyBridge } from "@/services/nemis-bridge/county";
import { CopyButton } from "@/components/county/schools/registration/CopyButton";
import { checkUserRows, parseUserCsv, USER_CSV_TEMPLATE } from "@/components/county/users/bulkUserCsv";

const STEPS = [
  { number: 1, title: "Upload CSV File", description: "Import users" },
  { number: 2, title: "Preview Users", description: "Verify data" },
  { number: 3, title: "Results", description: "View outcome" },
];

const USERS_PATH = "/government/county/users";

// Same wording as the list page: the server took the change, the follow-up
// pull did not run, so local data catches up on the next sync.
const SYNC_NOTE = "Saved — this will appear once this device syncs.";

/** The web's Blob + anchor download (as the schools bulk import's XLSX.writeFile). */
function downloadCsv(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Port of portal-web government/county/users/create/bulk (spec §2, §5.4).
 * Online only; rows are checked offline against local data before sending,
 * and the main process adds the County Admin's countyId. */
export default function BulkCreateUsersPage() {
  const router = useRouter();
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);
  const optionsVm = useCountyUserOptionsViewModel();
  const options = useViewModel(optionsVm.store, (s) => s.options);
  useRevalidateOnSync(() => {
    void optionsVm.load();
  }, [optionsVm]);

  const optionData = options.status === "success" || options.status === "refreshing" ? options.data : null;
  const county = optionData?.county ?? null;

  const [currentStep, setCurrentStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedUsers, setParsedUsers] = useState<CountyBulkUserRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Activation URLs live only here, while the results are shown.
  const [results, setResults] = useState<CountyBulkCreateUsersResult | null>(null);
  const [refreshed, setRefreshed] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Desktop-only: the offline row checks; none until the local options load.
  const problems = useMemo(
    () => (optionData ? checkUserRows(parsedUsers, optionData) : []),
    [parsedUsers, optionData],
  );
  const canSubmit = online && !!optionData && parsedUsers.length > 0 && problems.length === 0 && !isLoading;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      parseCSV(file);
    }
    // Lets the same file be chosen again after a fix.
    e.target.value = "";
  };

  const parseCSV = (file: File) => {
    setParseError("");
    setParsedUsers([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const { rows, error } = parseUserCsv(text);
        if (error) {
          setParseError(error);
          return;
        }
        setParsedUsers(rows);
        setCurrentStep(2);
      } catch {
        setParseError("Failed to parse CSV file. Please check the format.");
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    downloadCsv(USER_CSV_TEMPLATE, "user_import_template.csv");
  };

  const handleSubmit = async () => {
    if (parsedUsers.length === 0) {
      setParseError("No users to create");
      return;
    }
    if (!canSubmit) return;
    setParseError("");
    setIsLoading(true);
    try {
      const result = await countyBridge.bulkCreateUsers(parsedUsers);
      setResults(result.data);
      setRefreshed(result.refreshed);
      setCurrentStep(3);
    } catch (error: unknown) {
      setParseError(parseIpcError(error)?.message || "Failed to create users. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadFailedRecords = () => {
    if (!results || results.failed.length === 0) return;
    const csvContent = `email,error\n${results.failed.map((f) => `${f.email},"${f.error}"`).join("\n")}`;
    downloadCsv(csvContent, "failed_users.csv");
  };

  const handleCancel = () => {
    router.push(USERS_PATH);
  };

  const handleBack = () => {
    if (currentStep > 1 && !results) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Users
          </button>
          <h1 className="text-3xl font-bold text-neutral-dark">Bulk Create Users</h1>
          <p className="text-gray-600 mt-2">Upload a CSV file to create multiple users at once.</p>
        </div>

        {!online && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">User changes need an internet connection.</p>
          </div>
        )}

        <div className="flex gap-8">
          {/* Vertical Progress Indicator - Left Side */}
          <div className="w-64 flex-shrink-0">
            <Card className="sticky top-8">
              <h2 className="text-lg font-semibold text-neutral-dark mb-6">Progress</h2>
              <div className="space-y-1">
                {STEPS.map((step, index) => (
                  <div key={step.number}>
                    <div
                      className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                        currentStep === step.number
                          ? "bg-primary/10 border-l-4 border-primary"
                          : currentStep > step.number
                            ? "bg-green-50 border-l-4 border-green-500"
                            : "bg-white border-l-4 border-transparent"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                          currentStep === step.number
                            ? "bg-primary text-white"
                            : currentStep > step.number
                              ? "bg-green-500 text-white"
                              : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {currentStep > step.number ? <Check className="w-4 h-4" /> : step.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${
                            currentStep === step.number
                              ? "text-primary"
                              : currentStep > step.number
                                ? "text-green-700"
                                : "text-gray-600"
                          }`}
                        >
                          {step.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                      </div>
                    </div>
                    {index < STEPS.length - 1 && (
                      <div
                        className={`ml-7 h-6 w-0.5 ${currentStep > step.number ? "bg-green-500" : "bg-gray-200"}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Main Content - Right Side */}
          <div className="flex-1 min-w-0">
            {/* Step 1: Upload CSV File */}
            {currentStep === 1 && (
              <Card>
                <h2 className="text-xl font-semibold text-neutral-dark mb-6">Upload CSV File</h2>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-700">
                    <strong>County:</strong> {county?.name || "Loading..."}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Upload a CSV file to create multiple users at once</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700">CSV File</label>
                      <Button type="button" variant="secondary" size="sm" onClick={handleDownloadTemplate}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Template
                      </Button>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-colors"
                    >
                      {csvFile ? (
                        <div>
                          <Check className="w-12 h-12 text-success mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-900">{csvFile.name}</p>
                          <p className="text-xs text-gray-600 mt-1">Click to change file</p>
                        </div>
                      ) : (
                        <div>
                          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-900">Click to upload CSV file</p>
                          <p className="text-xs text-gray-600 mt-1">or drag and drop</p>
                        </div>
                      )}
                    </button>
                  </div>

                  {parseError && (
                    <div className="p-4 bg-error/10 border border-error rounded-lg">
                      <p className="text-error text-sm">{parseError}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Step 2: Preview Users */}
            {currentStep === 2 && !results && (
              <Card>
                <h2 className="text-xl font-semibold text-neutral-dark mb-6">
                  Preview Users ({parsedUsers.length} users)
                </h2>

                {problems.length > 0 && (
                  <div className="p-4 bg-error/10 border border-error rounded-lg mb-4">
                    <ul className="space-y-1">
                      {problems.map((problem, index) => (
                        <li key={index} className="text-error text-sm">
                          {problem.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {parsedUsers.map((user, index) => (
                          <tr key={index}>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {user.firstName} {user.lastName}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{user.phoneNumber}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{user.role}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {parseError && (
                  <div className="p-4 bg-error/10 border border-error rounded-lg mt-4">
                    <p className="text-error text-sm">{parseError}</p>
                  </div>
                )}
              </Card>
            )}

            {/* Step 3: Results */}
            {currentStep === 3 && results && (
              <Card>
                <h2 className="text-xl font-semibold text-neutral-dark mb-6">Bulk User Creation Results</h2>

                {!refreshed && results.succeeded.length > 0 && (
                  <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 mb-6">
                    <p className="text-sm text-sky-700">{SYNC_NOTE}</p>
                  </div>
                )}

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-success/5 border-success">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-success">{results.succeeded.length}</div>
                        <div className="text-sm text-gray-600 mt-1">Created Successfully</div>
                      </div>
                    </Card>
                    <Card className="bg-error/5 border-error">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-error">{results.failed.length}</div>
                        <div className="text-sm text-gray-600 mt-1">Failed</div>
                      </div>
                    </Card>
                  </div>

                  {results.succeeded.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">Successfully Created Users</h3>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {results.succeeded.map((item, index) => (
                          <div key={index} className="p-3 bg-success/5 border border-success/20 rounded-lg">
                            <div className="font-medium text-sm text-gray-900">{item.name}</div>
                            <div className="text-xs text-gray-600">{item.email}</div>
                            <div className="flex items-center gap-2 mt-2">
                              {item.activationUrl ? (
                                <>
                                  <code className="flex-1 min-w-0 text-xs font-mono text-gray-800 break-all">
                                    {item.activationUrl}
                                  </code>
                                  <CopyButton text={item.activationUrl} />
                                </>
                              ) : (
                                <span className="text-xs text-gray-500">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.failed.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-error">Failed Users</h3>
                        <Button type="button" variant="secondary" size="sm" onClick={handleDownloadFailedRecords}>
                          <Download className="w-4 h-4 mr-2" />
                          Download Failed Records
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {results.failed.map((item, index) => (
                          <div key={index} className="p-3 bg-error/5 border border-error/20 rounded-lg">
                            <div className="font-medium text-sm text-gray-900">{item.email || "—"}</div>
                            <div className="text-xs text-error mt-1">{item.error}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between mt-6">
              <div>
                {currentStep > 1 && !results && (
                  <Button
                    key="back"
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={handleBack}
                    disabled={isLoading}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-4">
                <Button type="button" variant="secondary" size="lg" onClick={handleCancel} disabled={isLoading}>
                  {results ? "Done" : "Cancel"}
                </Button>

                {/* Its own keyed conditional, never a slot shared with another button. */}

                {currentStep === 2 && !results && (
                  <Button
                    key="submit"
                    type="button"
                    variant="primary"
                    size="lg"
                    onClick={() => void handleSubmit()}
                    loading={isLoading}
                    disabled={!canSubmit}
                  >
                    Create {parsedUsers.length} Users
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
