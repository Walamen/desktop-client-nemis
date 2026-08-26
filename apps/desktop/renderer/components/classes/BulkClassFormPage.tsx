'use client';
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { GradeLevel, type GradeLevel as GradeLevelValue } from '@nemis-desktop/types';
import { Input } from '@nemis-desktop/ui';
import { ArrowLeft, Download, Upload, Trash2, Plus, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel, useAcademicYearViewModel, useSettingsViewModel } from '@/lib/presentation/hooks/school-admin';
import { formatGrade, getFilteredGradeGroups } from './shared';

interface ClassBulkRow {
  id: string;
  gradeLevel: string;
  section: string;
  capacity: string;
  errors: Record<string, string>;
}

interface CreatedRow {
  index: number;
  label: string;
}

interface FailedRow {
  index: number;
  label: string;
  error: string;
}

interface BulkResult {
  totalRequested: number;
  created: CreatedRow[];
  failed: FailedRow[];
}

type Phase = 'build' | 'done';

const makeId = () => Math.random().toString(36).slice(2, 10);
const GRADE_VALUES = new Set<string>(Object.values(GradeLevel));

const emptyRow = (): ClassBulkRow => ({ id: makeId(), gradeLevel: '', section: '', capacity: '', errors: {} });

const previewName = (gradeLevel: string, section: string) => {
  if (!gradeLevel) return '';
  const trimmedSection = section.trim();
  return trimmedSection ? `${formatGrade(gradeLevel)} ${trimmedSection}` : formatGrade(gradeLevel);
};

/** Recomputes per-row errors, including cross-row duplicate detection (same
 * grade + section combination twice in one batch) — mirrors portal-web's
 * bulk-create validation, which also validates the whole array at once. */
function revalidate(rows: ClassBulkRow[]): ClassBulkRow[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const errors: Record<string, string> = {};
    const grade = row.gradeLevel.trim().toUpperCase();
    if (!grade) errors.gradeLevel = 'Required';
    else if (!GRADE_VALUES.has(grade)) errors.gradeLevel = 'Invalid grade level';

    if (row.capacity.trim()) {
      const cap = Number(row.capacity);
      if (!Number.isInteger(cap) || cap < 1) errors.capacity = 'Must be a positive whole number';
    }

    if (grade) {
      const key = `${grade}::${row.section.trim().toUpperCase()}`;
      if (seen.has(key)) errors.section = 'Duplicate — same grade and section already in this batch';
      seen.add(key);
    }

    return { ...row, errors };
  });
}

const HEADERS = ['Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)', 'Section', 'Capacity'];
const EXAMPLE_ROW = ['GRADE_7', 'A', '40'];

function downloadTemplate(): void {
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, EXAMPLE_ROW]);
  sheet['!cols'] = HEADERS.map(() => ({ wch: 32 }));

  const refRows: string[][] = [['Valid Grade Levels']];
  Object.values(GradeLevel).forEach((g) => refRows.push([g]));
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Classes');
  XLSX.utils.book_append_sheet(wb, refSheet, 'Reference');
  XLSX.writeFile(wb, 'class-bulk-create-template.xlsx');
}

function pick(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== '') return String(value).trim();
  }
  return '';
}

/** Reads the first sheet of an uploaded workbook. `XLSX.read` with
 * `type: 'array'` auto-detects the underlying format, so this also accepts
 * plain .csv files uploaded through the same picker — not just .xlsx. */
function parseWorkbookToRows(data: Uint8Array): ClassBulkRow[] {
  const wb = XLSX.read(data, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  return raw
    .map((r) => ({
      gradeLevel: pick(r, HEADERS[0]!, 'Grade Level', 'gradeLevel').toUpperCase(),
      section: pick(r, 'Section', 'section').toUpperCase(),
      capacity: pick(r, 'Capacity', 'capacity'),
    }))
    .filter((r) => r.gradeLevel)
    .filter((r) => !(r.gradeLevel === EXAMPLE_ROW[0] && r.section === EXAMPLE_ROW[1] && r.capacity === EXAMPLE_ROW[2]))
    .map((r) => ({ id: makeId(), ...r, errors: {} }));
}

const inputClass = (hasError: boolean) =>
  `w-full px-2 py-1.5 text-sm rounded border ${hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-1 focus:ring-sky-500/40`;

/** Bulk Create Classes — lets a school admin add several classes at once
 * (e.g. spinning up A/B/C sections for a grade) without repeating the
 * single-create form. Rows can come from a quick "grade + sections" adder,
 * manual entry, or an uploaded .xlsx/.csv file; every row is submitted
 * through the same offline-first `createClass` path the single-create page
 * uses (one local SQLite write + outbox record per class, same as
 * everywhere else in this app). */
export function BulkClassFormPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vm = useAcademicFoundationViewModel();
  const academicYear = useAcademicYearViewModel();
  const settings = useSettingsViewModel();

  const years = useViewModel(vm.store, (s) => s.academicYears);
  const currentYear = useViewModel(academicYear.store, (s) => s.current);
  const profile = useViewModel(settings.store, (s) => s.profile);

  const [phase, setPhase] = useState<Phase>('build');
  const [academicYearId, setAcademicYearId] = useState('');
  const [rows, setRows] = useState<ClassBulkRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const [quickGrade, setQuickGrade] = useState('');
  const [quickSections, setQuickSections] = useState('');
  const [quickCapacity, setQuickCapacity] = useState('');

  useEffect(() => {
    void vm.loadAcademicYears();
    void academicYear.loadCurrent();
    void settings.loadCurrentSchool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!academicYearId && (currentYear.status === 'success' || currentYear.status === 'refreshing')) {
      setAcademicYearId(currentYear.data.id);
    }
  }, [currentYear, academicYearId]);

  const schoolName = profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';
  const yearOptions = years.status === 'success' || years.status === 'refreshing' ? years.data : [];
  const allowedGrades = profile.status === 'success' || profile.status === 'refreshing' ? profile.data.allowedGrades : undefined;
  const gradeGroups = getFilteredGradeGroups(allowedGrades);

  const setRowsValidated = (updater: (prev: ClassBulkRow[]) => ClassBulkRow[]) => setRows((prev) => revalidate(updater(prev)));

  const handleQuickAdd = () => {
    if (!quickGrade) return;
    const sections = quickSections
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const toAdd = sections.length > 0 ? sections : [''];
    const newRows: ClassBulkRow[] = toAdd.map((section) => ({
      id: makeId(),
      gradeLevel: quickGrade,
      section,
      capacity: quickCapacity,
      errors: {},
    }));
    setRowsValidated((prev) => [...prev, ...newRows]);
    setQuickGrade('');
    setQuickSections('');
    setQuickCapacity('');
  };

  const parseFile = (file: File) => {
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const parsed = parseWorkbookToRows(data);
        if (parsed.length === 0) {
          setUploadError('No data rows found. Make sure you filled in the Classes sheet (the example row is ignored automatically).');
          return;
        }
        setRowsValidated((prev) => [...prev, ...parsed]);
      } catch {
        setUploadError('Could not read the file. Please use the downloaded template.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

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

  const updateRow = (id: string, patch: Partial<Omit<ClassBulkRow, 'id' | 'errors'>>) =>
    setRowsValidated((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const deleteRow = (id: string) => setRowsValidated((prev) => prev.filter((r) => r.id !== id));
  const addRow = () => setRowsValidated((prev) => [...prev, emptyRow()]);

  const validRows = rows.filter((r) => Object.keys(r.errors).length === 0);

  const handleSubmit = async () => {
    if (validRows.length === 0 || !academicYearId || isSubmitting) return;
    setIsSubmitting(true);
    const created: CreatedRow[] = [];
    const failed: FailedRow[] = [];

    // Sequential, not parallel — each row is its own local write + outbox
    // record through the ViewModel/IPC layer, and running them one at a
    // time keeps per-row error attribution honest.
    for (let index = 0; index < validRows.length; index += 1) {
      const row = validRows[index]!;
      const gradeLevel = row.gradeLevel.trim().toUpperCase() as GradeLevelValue;
      const section = row.section.trim();
      const label = previewName(gradeLevel, section);
      try {
        const outcome = await vm.createClass({
          academicYearId,
          name: label,
          gradeLevel,
          section: section || undefined,
          capacity: row.capacity.trim() ? Number(row.capacity) : undefined,
        });
        if (outcome.ok) created.push({ index, label });
        else failed.push({ index, label, error: outcome.error.userMessage });
      } catch (cause) {
        failed.push({ index, label, error: cause instanceof Error ? cause.message : 'Unexpected error creating this class.' });
      }
    }

    setResult({ totalRequested: validRows.length, created, failed });
    setPhase('done');
    setIsSubmitting(false);
  };

  const handleCreateMore = () => {
    setRows([]);
    setResult(null);
    setPhase('build');
  };

  const handleRetryFailed = () => {
    if (!result) return;
    const failedIndexes = new Set(result.failed.map((f) => f.index));
    setRowsValidated(() => validRows.filter((_, i) => failedIndexes.has(i)));
    setResult(null);
    setPhase('build');
  };

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Bulk Create Classes</h1>
        </div>
        <p className="text-sm font-medium text-slate-300">{schoolName}</p>
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="mb-2">
          <Link href="/government/school-admin/classes" className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Classes
          </Link>
          <p className="text-gray-600">
            Add several classes at once — use the quick adder for multiple sections of a grade, add rows manually, or upload a
            spreadsheet. Once created, go to the Unassigned Students tab to assign students to them.
          </p>
        </div>

        {phase === 'build' && (
          <>
            <div className="bg-white border border-slate-300 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Academic Year</h2>
              <select
                value={academicYearId}
                onChange={(e) => setAcademicYearId(e.target.value)}
                required
                className="w-full sm:w-80 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
              >
                <option value="">Select Academic Year</option>
                {yearOptions.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.code} {year.isCurrent ? '(Current)' : ''}
                  </option>
                ))}
              </select>
              {!academicYearId && <p className="text-xs text-amber-600 mt-2">Select an academic year before creating classes.</p>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-300 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Quick Add</h2>
                <p className="text-sm text-gray-600 mb-4">Pick a grade and list its sections to add several rows at once.</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Grade level</label>
                    <select value={quickGrade} onChange={(e) => setQuickGrade(e.target.value)} className={inputClass(false)}>
                      <option value="">Select grade</option>
                      {gradeGroups.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.grades.map((g) => (
                            <option key={g} value={g}>
                              {formatGrade(g)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Sections"
                    value={quickSections}
                    onChange={(e) => setQuickSections(e.target.value)}
                    placeholder="e.g., A, B, C — leave blank for a single class"
                  />
                  <Input
                    label="Capacity (optional, applies to each)"
                    type="number"
                    min="1"
                    value={quickCapacity}
                    onChange={(e) => setQuickCapacity(e.target.value)}
                    placeholder="e.g., 40"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAdd}
                    disabled={!quickGrade}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    Add to Table
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-300 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Upload a File</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Accepts <strong>.xlsx</strong> or <strong>.csv</strong>. Download the template to see the expected columns.
                </p>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="mb-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download className="mr-2 inline h-4 w-4" />
                  Download Template
                </button>
                {uploadError && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {uploadError}
                  </div>
                )}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-slate-900 bg-slate-100' : 'border-gray-300 hover:border-sky-700/60 hover:bg-gray-50'}`}
                >
                  <Upload className="mx-auto mb-3 h-8 w-8 text-gray-400" />
                  <p className="text-sm font-medium text-gray-700">Drag & drop, or click to browse</p>
                  <p className="mt-1 text-xs text-gray-500">.xlsx or .csv</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFileChange} />
              </div>
            </div>

            <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  <span className="font-semibold text-green-700">{validRows.length}</span> valid /{' '}
                  <span className="font-semibold text-red-600">{rows.length - validRows.length}</span> with errors
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addRow}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="mr-1 inline h-4 w-4" />
                    Add Row
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={validRows.length === 0 || !academicYearId || isSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creating…' : `Create ${validRows.length} Class${validRows.length !== 1 ? 'es' : ''}`}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">#</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[160px]">Grade Level *</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[120px]">Section</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">Class Name (Auto)</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[110px]">Capacity</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 whitespace-nowrap">Status</th>
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
                            <select
                              value={row.gradeLevel}
                              onChange={(e) => updateRow(row.id, { gradeLevel: e.target.value })}
                              className={inputClass(Boolean(row.errors.gradeLevel))}
                            >
                              <option value="">Select grade</option>
                              {gradeGroups.map((group) => (
                                <optgroup key={group.label} label={group.label}>
                                  {group.grades.map((g) => (
                                    <option key={g} value={g}>
                                      {formatGrade(g)}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            {row.errors.gradeLevel && <p className="mt-0.5 text-xs text-red-500">{row.errors.gradeLevel}</p>}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Input
                              type="text"
                              value={row.section}
                              placeholder="e.g., A, B"
                              maxLength={20}
                              onChange={(e) => updateRow(row.id, { section: e.target.value.toUpperCase() })}
                              error={row.errors.section}
                            />
                          </td>
                          <td className="px-3 py-2 pt-3 align-top text-gray-700">{previewName(row.gradeLevel, row.section) || '—'}</td>
                          <td className="px-3 py-2 align-top">
                            <Input
                              type="number"
                              min="1"
                              value={row.capacity}
                              placeholder="Optional"
                              onChange={(e) => updateRow(row.id, { capacity: e.target.value })}
                              error={row.errors.capacity}
                            />
                          </td>
                          <td className="px-3 py-2 pt-2.5 text-center align-top">
                            {hasErrors ? <AlertCircle className="mx-auto h-5 w-5 text-red-400" /> : <CheckCircle className="mx-auto h-5 w-5 text-green-500" />}
                          </td>
                          <td className="px-3 py-2 pt-2 align-top">
                            <button type="button" onClick={() => deleteRow(row.id)} title="Remove row" className="rounded p-1 text-gray-400 transition-colors hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div className="py-12 text-center text-sm text-gray-500">
                    No rows yet. Use Quick Add, upload a file, or click &quot;Add Row&quot; to add classes manually.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {phase === 'done' && result && (
          <div className="max-w-4xl">
            <div className="mb-6 grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                <p className="text-3xl font-bold text-gray-900">{result.totalRequested}</p>
                <p className="mt-1 text-sm text-gray-500">Submitted</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                <p className="text-3xl font-bold text-green-600">{result.created.length}</p>
                <p className="mt-1 text-sm text-gray-500">Created</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                <p className="text-3xl font-bold text-red-500">{result.failed.length}</p>
                <p className="mt-1 text-sm text-gray-500">Failed</p>
              </div>
            </div>

            {result.created.length > 0 && (
              <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
                <h3 className="mb-3 text-base font-semibold text-gray-900">Created Classes</h3>
                <div className="space-y-2">
                  {result.created.map((c) => (
                    <div key={c.index} className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
                      <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                      <p className="text-sm font-medium text-green-800">{c.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.failed.length > 0 && (
              <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
                <h3 className="mb-3 text-base font-semibold text-red-700">Failed Classes</h3>
                <div className="space-y-2">
                  {result.failed.map((f) => (
                    <div key={f.index} className="flex items-start gap-2 rounded-lg bg-red-50 p-3">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-red-800">{f.label || `Row ${f.index + 1}`}</p>
                        <p className="mt-0.5 text-xs text-red-600">{f.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {result.failed.length > 0 && (
                <button type="button" onClick={handleRetryFailed} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Retry Failed Rows
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push('/government/school-admin/classes')}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Done
              </button>
              <button type="button" onClick={handleCreateMore} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Create More
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
