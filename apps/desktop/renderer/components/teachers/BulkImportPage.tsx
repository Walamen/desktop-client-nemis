'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Upload, Trash2, Plus, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  EmploymentType, Gender, StaffPosition,
  type EmploymentType as EmploymentTypeValue, type Gender as GenderValue,
} from '@nemis-desktop/types';
import { useViewModel } from '@/hooks/use-view-model';
import { useSettingsViewModel, useTeachersListViewModel } from '@/lib/presentation/hooks/school-admin';
import { Input } from '@nemis-desktop/ui';
import { human } from './shared';

interface BulkRow {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phoneNumber: string;
  email: string;
  employeeNumber: string;
  employmentType: string;
  dateOfJoining: string;
  errors: Record<string, string>;
}

type Step = 'upload' | 'review' | 'done';

interface BulkImportResult {
  totalRequested: number;
  created: number;
  failed: number;
  createdRows: { index: number; employeeNumber: string; teacherId: string }[];
  failedRows: { index: number; employeeNumber: string; error: string }[];
}

const makeId = () => Math.random().toString(36).slice(2, 10);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_GENDERS = new Set<string>(Object.values(Gender));
const VALID_EMPLOYMENT_TYPES = new Set<string>(Object.values(EmploymentType));

const emptyRow = (): BulkRow => ({
  id: makeId(),
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  phoneNumber: '',
  email: '',
  employeeNumber: '',
  employmentType: '',
  dateOfJoining: new Date().toISOString().slice(0, 10),
  errors: {},
});

function validateRow(row: BulkRow): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!row.firstName.trim()) errors.firstName = 'Required';
  if (!row.lastName.trim()) errors.lastName = 'Required';

  if (!row.dateOfBirth.trim()) errors.dateOfBirth = 'Required';
  else if (Number.isNaN(new Date(row.dateOfBirth).getTime())) errors.dateOfBirth = 'Invalid date (YYYY-MM-DD)';

  if (!row.gender.trim()) errors.gender = 'Required';
  else if (!VALID_GENDERS.has(row.gender.toUpperCase())) errors.gender = 'Must be MALE, FEMALE, or OTHER';

  if (!row.phoneNumber.trim()) errors.phoneNumber = 'Required';

  if (row.email.trim() && !EMAIL_RE.test(row.email.trim())) errors.email = 'Invalid email';

  if (!row.employeeNumber.trim()) errors.employeeNumber = 'Required';

  if (!row.employmentType.trim()) errors.employmentType = 'Required';
  else if (!VALID_EMPLOYMENT_TYPES.has(row.employmentType.toUpperCase()))
    errors.employmentType = 'Must be FULL_TIME, PART_TIME, CONTRACT, or TEMPORARY';

  if (!row.dateOfJoining.trim()) errors.dateOfJoining = 'Required';
  else if (Number.isNaN(new Date(row.dateOfJoining).getTime())) errors.dateOfJoining = 'Invalid date (YYYY-MM-DD)';

  return errors;
}

// ─── Excel template + parsing (SheetJS `xlsx`) — mirrors the web portal's
// bulk-import wizard. Two gaps stay dropped here, same as the student
// importer: no Position column (this page is scoped to TEACHER, same as the
// web reference and the rest of this directory) and no login-credential
// output on the results step (no online account system on an offline device
// to issue credentials from). ──

const HEADERS: string[] = [
  'First Name *', 'Last Name *', 'Date of Birth * (YYYY-MM-DD)', 'Gender * (MALE/FEMALE/OTHER)',
  'Phone Number *', 'Email', 'Employee Number *',
  'Employment Type * (FULL_TIME/PART_TIME/CONTRACT/TEMPORARY)', 'Date of Joining * (YYYY-MM-DD)',
];

/** Normalizes an Excel date cell (real `Date` when `cellDates: true`, or a
 * plain string typed by hand) down to `YYYY-MM-DD`. */
function parseDateCell(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return str;
}

function downloadTemplate(): void {
  const example = [
    'Jane', 'Smith', '1990-03-20', 'FEMALE', '+231771234567', 'jane.smith@school.lr',
    'TCH-2024-001', 'FULL_TIME', new Date().toISOString().slice(0, 10),
  ];
  const teachersSheet = XLSX.utils.aoa_to_sheet([HEADERS, example]);
  teachersSheet['!cols'] = HEADERS.map(() => ({ wch: 32 }));

  const genderValues = Object.values(Gender);
  const employmentValues = Object.values(EmploymentType);
  const refRows: string[][] = [['Valid Genders', 'Valid Employment Types']];
  for (let i = 0; i < Math.max(genderValues.length, employmentValues.length); i += 1) {
    refRows.push([genderValues[i] ?? '', employmentValues[i] ?? '']);
  }
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 18 }, { wch: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, teachersSheet, 'Teachers');
  XLSX.utils.book_append_sheet(wb, refSheet, 'Reference');
  XLSX.writeFile(wb, 'teacher-bulk-import-template.xlsx');
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
function parseWorkbookToRows(data: Uint8Array): BulkRow[] {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  return raw
    .filter((r) => {
      const employeeNumber = pick(r, 'Employee Number *', 'Employee Number', 'employeeNumber');
      return employeeNumber && employeeNumber !== 'TCH-2024-001' && !employeeNumber.toLowerCase().startsWith('example');
    })
    .map((r) => {
      const row: BulkRow = {
        id: makeId(),
        firstName: pick(r, 'First Name *', 'First Name', 'firstName'),
        lastName: pick(r, 'Last Name *', 'Last Name', 'lastName'),
        dateOfBirth: parseDateCell(r['Date of Birth * (YYYY-MM-DD)'] ?? r['Date of Birth'] ?? r['dateOfBirth'] ?? ''),
        gender: pick(r, 'Gender * (MALE/FEMALE/OTHER)', 'Gender', 'gender').toUpperCase(),
        phoneNumber: pick(r, 'Phone Number *', 'Phone Number', 'phoneNumber'),
        email: pick(r, 'Email', 'email').toLowerCase(),
        employeeNumber: pick(r, 'Employee Number *', 'Employee Number', 'employeeNumber'),
        employmentType: pick(
          r,
          'Employment Type * (FULL_TIME/PART_TIME/CONTRACT/TEMPORARY)', 'Employment Type', 'employmentType',
        ).toUpperCase(),
        dateOfJoining: parseDateCell(r['Date of Joining * (YYYY-MM-DD)'] ?? r['Date of Joining'] ?? r['dateOfJoining'] ?? ''),
        errors: {},
      };
      row.errors = validateRow(row);
      return row;
    });
}

const inputClass = (hasError: boolean) =>
  `w-full px-2 py-1.5 text-sm rounded border ${hasError ? 'border-red-400 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-1 focus:ring-sky-500/40`;

export function BulkImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settings = useSettingsViewModel();
  const list = useTeachersListViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);

  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          window.alert('No data rows found. Make sure you filled in the Teachers sheet (the example row is ignored automatically).');
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

  const handleSubmit = async () => {
    if (validRows.length === 0 || !institutionId || isSubmitting) return;
    setIsSubmitting(true);
    const createdRows: BulkImportResult['createdRows'] = [];
    const failedRows: BulkImportResult['failedRows'] = [];

    // Sequential, not parallel — each row goes through the same offline
    // create/sync-queue path as "Add Teacher", and running them one at a
    // time keeps per-row error attribution honest.
    for (let index = 0; index < validRows.length; index += 1) {
      const row = validRows[index]!;
      try {
        const outcome = await list.createTeacher({
          institutionId,
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          dateOfBirth: row.dateOfBirth.trim(),
          gender: row.gender.toUpperCase() as GenderValue,
          phoneNumber: row.phoneNumber.trim(),
          email: row.email.trim() || undefined,
          employeeNumber: row.employeeNumber.trim(),
          position: StaffPosition.TEACHER,
          employmentType: row.employmentType.toUpperCase() as EmploymentTypeValue,
          dateOfJoining: row.dateOfJoining.trim(),
        });
        if (!outcome.ok) {
          failedRows.push({ index, employeeNumber: row.employeeNumber, error: outcome.error.userMessage });
          continue;
        }
        createdRows.push({ index, employeeNumber: row.employeeNumber, teacherId: outcome.data.id });
      } catch (cause) {
        failedRows.push({
          index, employeeNumber: row.employeeNumber,
          error: cause instanceof Error ? cause.message : 'Unexpected error creating this teacher.',
        });
      }
    }

    setResult({ totalRequested: validRows.length, created: createdRows.length, failed: failedRows.length, createdRows, failedRows });
    setStep('done');
    setIsSubmitting(false);
  };

  const handleReset = () => {
    setRows([]);
    setResult(null);
    setStep('upload');
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-slate-900 px-6 py-5 text-white">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">School Admin Portal</p>
          <h1 className="mt-0.5 text-xl font-bold">Bulk Import Teachers</h1>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-300">{schoolName}</p>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        <div className="mb-6">
          <Link href="/government/school-admin/teachers-staff" className="mb-4 flex items-center text-gray-600 transition-colors hover:text-gray-900">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Teachers
          </Link>
          <p className="mt-2 text-gray-600">
            Download the template, fill in teacher details, upload, review, then import. Each row creates a real
            offline teacher record, stored on this device and synced like any other change.
          </p>
        </div>

        {step === 'upload' && (
          <div className="max-w-2xl">
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Step 1 — Download Template</h2>
              <p className="mb-4 text-sm text-gray-600">
                The template includes a Reference sheet with valid values for gender and employment type. Only
                required fields are marked with <strong>*</strong>.
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
                <button type="button" onClick={() => void handleSubmit()} disabled={validRows.length === 0 || isSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {isSubmitting ? 'Importing…' : `Import ${validRows.length} Teacher${validRows.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">#</th>
                    <th className="min-w-[110px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">First Name *</th>
                    <th className="min-w-[110px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Last Name *</th>
                    <th className="min-w-[115px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Date of Birth *</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Gender *</th>
                    <th className="min-w-[130px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Phone *</th>
                    <th className="min-w-[180px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Email</th>
                    <th className="min-w-[120px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Employee No *</th>
                    <th className="min-w-[130px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Employment Type *</th>
                    <th className="min-w-[115px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Date Joined *</th>
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
                            {Object.values(Gender).map((g) => <option key={g} value={g}>{human(g)}</option>)}
                          </select>
                          {row.errors.gender && <p className="mt-0.5 text-xs text-red-500">{row.errors.gender}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="tel" value={row.phoneNumber} placeholder="+231770000000"
                            onChange={(e) => updateRow(row.id, { phoneNumber: e.target.value })}
                            error={row.errors.phoneNumber} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="email" value={row.email} placeholder="teacher@school.lr"
                            onChange={(e) => updateRow(row.id, { email: e.target.value })}
                            error={row.errors.email} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="text" value={row.employeeNumber} placeholder="TCH-001"
                            onChange={(e) => updateRow(row.id, { employeeNumber: e.target.value })}
                            error={row.errors.employeeNumber} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select value={row.employmentType} onChange={(e) => updateRow(row.id, { employmentType: e.target.value })}
                            className={inputClass(Boolean(row.errors.employmentType))}>
                            <option value="">Select type</option>
                            {Object.values(EmploymentType).map((t) => <option key={t} value={t}>{human(t)}</option>)}
                          </select>
                          {row.errors.employmentType && <p className="mt-0.5 text-xs text-red-500">{row.errors.employmentType}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Input type="date" value={row.dateOfJoining}
                            onChange={(e) => updateRow(row.id, { dateOfJoining: e.target.value })}
                            error={row.errors.dateOfJoining} />
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
                <div className="py-12 text-center text-sm text-gray-500">No rows. Click &quot;Add Row&quot; to add teachers manually.</div>
              )}
            </div>

            <div className="mt-4 flex justify-between">
              <button type="button" onClick={addRow}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Plus className="mr-1 inline h-4 w-4" />
                Add Row
              </button>
              <button type="button" onClick={() => void handleSubmit()} disabled={validRows.length === 0 || isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {isSubmitting ? 'Importing…' : `Import ${validRows.length} Valid Teacher${validRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="max-w-4xl">
            <div className="mb-6 grid grid-cols-3 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                <p className="text-3xl font-bold text-gray-900">{result.totalRequested}</p>
                <p className="mt-1 text-sm text-gray-500">Submitted</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                <p className="text-3xl font-bold text-green-600">{result.created}</p>
                <p className="mt-1 text-sm text-gray-500">Created</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
                <p className="text-3xl font-bold text-red-500">{result.failed}</p>
                <p className="mt-1 text-sm text-gray-500">Failed</p>
              </div>
            </div>

            {result.createdRows.length > 0 && (
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-1 text-base font-semibold text-gray-900">Created Teachers</h3>
                <p className="mb-4 text-sm text-gray-600">
                  Each row created a real offline teacher record. There are no login credentials to share — this
                  device has no online account system to issue them from. Assign subjects and classes from the
                  teacher list.
                </p>
                <div className="space-y-2">
                  {result.createdRows.map((c) => (
                    <div key={c.index} className="flex items-start gap-2 rounded-lg bg-green-50 p-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      <p className="text-sm font-medium text-green-800">{c.employeeNumber}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.failedRows.length > 0 && (
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-1 text-base font-semibold text-red-700">Failed Teachers</h3>
                <div className="mt-3 space-y-2">
                  {result.failedRows.map((f) => (
                    <div key={f.index} className="flex items-start gap-2 rounded-lg bg-red-50 p-3">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-red-800">{f.employeeNumber || `Row ${f.index + 1}`}</p>
                        <p className="mt-0.5 text-xs text-red-600">{f.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {result.failedRows.length > 0 && (
                <button type="button"
                  onClick={() => {
                    const failedNums = new Set(result.failedRows.map((f) => f.employeeNumber));
                    setRows((prev) => prev.filter((r) => failedNums.has(r.employeeNumber)).map((r) => ({ ...r, errors: validateRow(r) })));
                    setStep('review');
                    setResult(null);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Retry Failed Rows
                </button>
              )}
              <button type="button" onClick={() => router.push('/government/school-admin/teachers-staff')}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Go to Teachers List
              </button>
              <button type="button" onClick={handleReset}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Import More Teachers
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
