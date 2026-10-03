'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Upload, Trash2, Plus, CheckCircle, XCircle, AlertCircle, RotateCcw } from 'lucide-react';
import type { GradeLevel as GradeLevelValue } from '@nemis-desktop/types';
import { useViewModel } from '@/hooks/use-view-model';
import { useSettingsViewModel, useStudentsListViewModel } from '@/lib/presentation/hooks/school-admin';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { registryBridge } from '@/services/nemis-bridge/school-admin/registry-bridge';
import { Input, Select } from '@nemis-desktop/ui';
import { formatNemisId } from '@nemis-desktop/shared';
import { grades, human } from './shared';
import { ClassTermPicker, isClassTermComplete, type ClassTermValue } from './add-student/ClassTermPicker';

import {
  makeId,
  validateRow,
  downloadTemplate,
  downloadRetryFile,
  parseWorkbookToRows,
  type BulkRow,
  type RetryEntry,
} from './bulk-import/bulk-import-logic';
import { runBulkImport, type BulkImportOutcome } from './bulk-import/run-bulk-import';

type Step = 'upload' | 'review' | 'done';

interface BulkImportResult extends BulkImportOutcome {
  /** The review rows as submitted: every `originalIndex` points into this. */
  rows: BulkRow[];
}

const EMPTY_TARGET: ClassTermValue = { academicYearId: '', classId: '', termId: '' };

const emptyRow = (): BulkRow => ({
  id: makeId(),
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  admissionDate: new Date().toISOString().slice(0, 10),
  gradeLevel: '',
  nemisId: '',
  guardianFirstName: '',
  guardianLastName: '',
  guardianRelationship: '',
  guardianPhone: '',
  studentEmail: '',
  errors: {},
});

const inputClass = (hasError: boolean) =>
  `w-full px-2 py-1.5 text-sm rounded border ${hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-1 focus:ring-sky-500/40`;

const rowLabel = (originalIndex: number) => `Row ${originalIndex + 1}`;

/** Retry entries grouped by reason, so a batch-level message (one server
 * rejection for every NEMIS-ID row) is shown once, with its row numbers. */
function groupRetry(retry: RetryEntry[]): { label: string; reason: string }[] {
  const byReason = new Map<string, number[]>();
  for (const entry of [...retry].sort((a, b) => a.originalIndex - b.originalIndex)) {
    const list = byReason.get(entry.reason) ?? [];
    list.push(entry.originalIndex + 1);
    byReason.set(entry.reason, list);
  }
  return [...byReason.entries()].map(([reason, numbers]) => ({
    reason,
    label: numbers.length === 1 ? `Row ${numbers[0]}` : `Rows ${numbers.join(', ')}`,
  }));
}

function Count({ testId, value, label, tone }: { testId: string; value: number; label: string; tone: string }) {
  return (
    <div data-testid={testId} className="rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm">
      <p className={`text-3xl font-bold ${tone}`}>{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  );
}

export function BulkImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settings = useSettingsViewModel();
  const listVm = useStudentsListViewModel();
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);
  const profile = useViewModel(settings.store, (s) => s.profile);

  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchGrade, setBatchGrade] = useState<GradeLevelValue | ''>('');
  const [target, setTarget] = useState<ClassTermValue>(EMPTY_TARGET);

  useEffect(() => {
    void settings.loadCurrentSchool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schoolName = profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';
  const institutionId = profile.status === 'success' || profile.status === 'refreshing' ? profile.data.id : null;

  const parseFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const parsed = parseWorkbookToRows(data);
        if (parsed.length === 0) {
          window.alert('No data rows found. Make sure you filled in the Students sheet (the example row is ignored automatically).');
          return;
        }
        setRows(parsed);
        setStep('review');
      } catch {
        window.alert('Could not read the file. Please use the downloaded template.');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const updateRow = (id: string, patch: Partial<Omit<BulkRow, 'id' | 'errors'>>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        updated.errors = validateRow(updated);
        return updated;
      }),
    );
  };

  const deleteRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const validRows = rows.filter((r) => Object.keys(r.errors).length === 0);
  const placementReady = Boolean(batchGrade) && isClassTermComplete(target);
  const canImport = validRows.length > 0 && placementReady && Boolean(institutionId) && !isSubmitting;

  const handleSubmit = async () => {
    if (!canImport || !institutionId || !batchGrade) return;
    setIsSubmitting(true);
    const submitted = rows;
    try {
      const outcome = await runBulkImport({
        rows: submitted,
        gradeLevel: batchGrade,
        institutionId,
        target,
        online,
        createAndEnroll: (request) => listVm.createAndEnrollStudent(request),
        bulkClaim: (request) => registryBridge.bulkClaimStudents(request),
      });
      setResult({ ...outcome, rows: submitted });
      setStep('done');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setRows([]);
    setResult(null);
    setStep('upload');
  };

  const handleRetryFailed = (failed: BulkImportResult) => {
    // By original index into the rows as submitted — not by position in the
    // valid subset, which shifts whenever an earlier row had errors.
    const keep = new Set(failed.failed.map((f) => f.originalIndex));
    setRows(failed.rows.filter((_, i) => keep.has(i)).map((r) => ({ ...r, errors: validateRow(r) })));
    setStep('review');
    setResult(null);
  };

  const importLabel = (suffix: string) =>
    isSubmitting ? 'Importing…' : `Import ${validRows.length} ${suffix}${validRows.length !== 1 ? 's' : ''}`;

  const nameOf = (r: BulkImportResult, originalIndex: number) => {
    const row = r.rows[originalIndex];
    return row ? `${row.firstName} ${row.lastName}`.trim() : '';
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-slate-900 px-6 py-5 text-white">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">School Admin Portal</p>
          <h1 className="mt-0.5 text-xl font-bold">Bulk Import Students</h1>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-300">{schoolName}</p>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        <div className="mb-6">
          <Link href="/government/school-admin/students" className="mb-4 flex items-center text-gray-600 transition-colors hover:text-gray-900">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Students
          </Link>
          <p className="mt-2 text-gray-600">
            Download the template, fill in student details, upload, choose the class and term, review, then import.
            Rows without a NEMIS ID are created on this device and enrolled in the chosen class; rows with a NEMIS ID
            are claimed from the national registry, which needs a connection.
          </p>
        </div>

        {step === 'upload' && (
          <div className="max-w-2xl">
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Step 1 — Download Template</h2>
              <p className="mb-4 text-sm text-gray-600">
                Only required fields are marked with <strong>*</strong>. Grade level accepts KG, K1, K2, or GRADE_1
                through GRADE_12. Leave the NEMIS ID blank for a student who has never had one.
              </p>
              <button type="button" onClick={downloadTemplate}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Download className="mr-2 inline h-4 w-4" />
                Download Template (.xlsx)
              </button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Step 2 — Upload Filled Template</h2>
              <p className="mb-4 text-sm text-gray-600">
                Accepts <strong>.xlsx</strong> or <strong>.csv</strong> files. The example row in the template is automatically ignored.
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${dragOver ? 'border-slate-900 bg-slate-100' : 'border-gray-300 hover:border-sky-700/60 hover:bg-gray-50'}`}
              >
                <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">Drag & drop your file here, or click to browse</p>
                <p className="mt-1 text-xs text-gray-500">.xlsx or .csv</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
        )}

        {step === 'review' && (
          <div>
            <div className="mb-5 max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Batch placement</h2>
              <p className="mb-4 text-sm text-gray-600">
                Every row is enrolled in this class and term. Rows whose grade level differs from the class grade are not imported.
              </p>
              <div className="space-y-3">
                <Select
                  label="Grade"
                  required
                  placeholder="Select grade"
                  options={grades.map((g) => ({ value: g, label: human(g) }))}
                  value={batchGrade}
                  onChange={(e) => {
                    // A class belongs to one grade; the term is kept.
                    setBatchGrade(e.target.value as GradeLevelValue);
                    setTarget((t) => ({ ...t, classId: '' }));
                  }}
                />
                <ClassTermPicker gradeLevel={batchGrade} value={target} onChange={setTarget} />
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  <span className="font-semibold text-green-700">{validRows.length}</span> valid /{' '}
                  <span className="font-semibold text-red-600">{rows.length - validRows.length}</span> with errors
                </span>
                <button type="button" onClick={() => setStep('upload')} className="text-xs text-gray-500 underline hover:text-gray-700">
                  Upload a different file
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={addRow}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Plus className="mr-1 inline h-4 w-4" />
                  Add Row
                </button>
                <button type="button" onClick={() => void handleSubmit()} disabled={!canImport}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {importLabel('Student')}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">#</th>
                    <th className="min-w-[100px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">First Name *</th>
                    <th className="min-w-[100px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Last Name *</th>
                    <th className="min-w-[110px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">DOB *</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Gender *</th>
                    <th className="min-w-[110px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Adm. Date *</th>
                    <th className="min-w-[130px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Grade Level *</th>
                    <th className="min-w-[150px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">NEMIS ID</th>
                    <th className="min-w-[110px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Guardian First *</th>
                    <th className="min-w-[110px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Guardian Last *</th>
                    <th className="min-w-[100px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Relationship *</th>
                    <th className="min-w-[120px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Guardian Phone *</th>
                    <th className="min-w-[160px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Student Email</th>
                    <th className="whitespace-nowrap px-3 py-3 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => {
                    const hasErrors = Object.keys(row.errors).length > 0;
                    return (
                      <tr key={row.id} className={hasErrors ? 'bg-red-50/40' : 'bg-white'}>
                        <td className="px-3 py-2 pt-3 align-top text-xs text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 align-top">
                          <Input type="text" value={row.firstName} placeholder="First name"
                            onChange={(e) => updateRow(row.id, { firstName: e.target.value })}
                            error={row.errors.firstName} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="text" value={row.lastName} placeholder="Last name"
                            onChange={(e) => updateRow(row.id, { lastName: e.target.value })}
                            error={row.errors.lastName} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="date" value={row.dateOfBirth}
                            onChange={(e) => updateRow(row.id, { dateOfBirth: e.target.value })}
                            error={row.errors.dateOfBirth} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select value={row.gender} onChange={(e) => updateRow(row.id, { gender: e.target.value })}
                            className={inputClass(Boolean(row.errors.gender))}>
                            <option value="">Select</option>
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                          </select>
                          {row.errors.gender && <p className="mt-0.5 text-xs text-red-500">{row.errors.gender}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="date" value={row.admissionDate}
                            onChange={(e) => updateRow(row.id, { admissionDate: e.target.value })}
                            error={row.errors.admissionDate} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select value={row.gradeLevel} onChange={(e) => updateRow(row.id, { gradeLevel: e.target.value })}
                            className={inputClass(Boolean(row.errors.gradeLevel))}>
                            <option value="">Select grade</option>
                            {grades.map((g) => <option key={g} value={g}>{human(g)}</option>)}
                          </select>
                          {row.errors.gradeLevel && <p className="mt-0.5 text-xs text-red-500">{row.errors.gradeLevel}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="text" value={row.nemisId} placeholder="Blank if new"
                            onChange={(e) => updateRow(row.id, { nemisId: e.target.value })}
                            error={row.errors.nemisId} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="text" value={row.guardianFirstName} placeholder="First name"
                            onChange={(e) => updateRow(row.id, { guardianFirstName: e.target.value })}
                            error={row.errors.guardianFirstName} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="text" value={row.guardianLastName} placeholder="Last name"
                            onChange={(e) => updateRow(row.id, { guardianLastName: e.target.value })}
                            error={row.errors.guardianLastName} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="text" value={row.guardianRelationship} placeholder="Mother"
                            onChange={(e) => updateRow(row.id, { guardianRelationship: e.target.value })}
                            error={row.errors.guardianRelationship} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="tel" value={row.guardianPhone} placeholder="+231770000000"
                            onChange={(e) => updateRow(row.id, { guardianPhone: e.target.value })}
                            error={row.errors.guardianPhone} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="email" value={row.studentEmail} placeholder="student@email.com"
                            onChange={(e) => updateRow(row.id, { studentEmail: e.target.value })}
                            error={row.errors.studentEmail} />
                        </td>
                        <td className="px-3 py-2 pt-2.5 text-center align-top">
                          {hasErrors ? <AlertCircle className="mx-auto h-5 w-5 text-red-400" /> : <CheckCircle className="mx-auto h-5 w-5 text-green-500" />}
                        </td>
                        <td className="px-3 py-2 pt-2 align-top">
                          <button type="button" onClick={() => deleteRow(row.id)} title="Remove row"
                            className="rounded p-1 text-gray-400 transition-colors hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div className="py-12 text-center text-sm text-gray-500">No rows. Click &quot;Add Row&quot; to add students manually.</div>
              )}
            </div>

            <div className="mt-4 flex justify-between">
              <button type="button" onClick={addRow}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Plus className="mr-1 inline h-4 w-4" />
                Add Row
              </button>
              <button type="button" onClick={() => void handleSubmit()} disabled={!canImport}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {importLabel('Valid Student')}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="max-w-4xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Import results</h2>

            {result.registryUnavailableMessage && (
              <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{result.registryUnavailableMessage}</p>
            )}
            {result.pendingSync && (
              <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                Saved — claimed students will appear once this device syncs.
              </p>
            )}

            <div className="mb-6 grid grid-cols-5 gap-3">
              <Count testId="count-submitted" value={result.submitted} label="Submitted" tone="text-gray-900" />
              <Count testId="count-created" value={result.created.length} label="Created on this device" tone="text-green-600" />
              <Count testId="count-claimed" value={result.claimed.length} label="Claimed" tone="text-green-600" />
              <Count testId="count-failed" value={result.failed.length} label="Failed" tone="text-red-500" />
              <Count testId="count-retry" value={result.retry.length} label="To retry" tone="text-amber-600" />
            </div>

            {result.created.length > 0 && (
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-gray-900">Created on this device</h3>
                <ul className="space-y-2">
                  {result.created.map((c) => (
                    <li key={c.originalIndex} className="flex items-start gap-2 rounded-lg bg-green-50 p-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      <div>
                        <p className="text-sm font-medium text-green-800">{rowLabel(c.originalIndex)}</p>
                        <p className="text-sm text-green-900">{nameOf(result, c.originalIndex)}</p>
                        <p className="text-sm font-medium text-green-800">{formatNemisId(c.nemisId)}</p>
                        <p className="mt-0.5 text-xs text-gray-600">Student login becomes available after this record syncs.</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.claimed.length > 0 && (
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-gray-900">Claimed from the national registry</h3>
                <ul className="space-y-2">
                  {result.claimed.map((c) => (
                    <li key={c.originalIndex} className="flex items-start gap-2 rounded-lg bg-green-50 p-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      <div>
                        <p className="text-sm font-medium text-green-800">{rowLabel(c.originalIndex)}</p>
                        <p className="text-sm text-green-900">{nameOf(result, c.originalIndex)}</p>
                        <p className="mt-0.5 text-xs text-gray-600">{`Signs in to the student portal with NEMIS ID ${formatNemisId(c.nemisId)}`}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.failed.length > 0 && (
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-red-700">Failed</h3>
                <ul className="space-y-2">
                  {result.failed.map((f) => (
                    <li key={f.originalIndex} className="flex items-start gap-2 rounded-lg bg-red-50 p-3">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-red-800">{rowLabel(f.originalIndex)}</p>
                        <p className="mt-0.5 text-xs text-red-600">{f.error}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.retry.length > 0 && (
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-amber-700">To retry</h3>
                  <button type="button" onClick={() => downloadRetryFile(result.rows, result.retry)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <Download className="mr-2 inline h-4 w-4" />
                    Download retry file
                  </button>
                </div>
                <ul className="space-y-2">
                  {groupRetry(result.retry).map((g) => (
                    <li key={g.reason} className="flex items-start gap-2 rounded-lg bg-amber-50 p-3">
                      <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">{g.label}</p>
                        <p className="mt-0.5 text-xs text-amber-700">{g.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              {result.failed.length > 0 && (
                <button type="button" onClick={() => handleRetryFailed(result)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Retry Failed Rows
                </button>
              )}
              <button type="button" onClick={() => router.push('/government/school-admin/students')}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Go to Students List
              </button>
              <button type="button" onClick={handleReset}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Import More Students
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
