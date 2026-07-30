'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Upload, Trash2, Plus, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { GradeLevel as GradeLevelValue } from '@nemis-desktop/types';
import { useViewModel } from '@/hooks/use-view-model';
import { useSettingsViewModel, useStudentProfileViewModel, useStudentsListViewModel } from '@/lib/presentation/hooks/school-admin';
import { grades, human } from './shared';

interface BulkRow {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  admissionDate: string;
  gradeLevel: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianRelationship: string;
  guardianPhone: string;
  studentEmail: string;
  errors: Record<string, string>;
}

type Step = 'upload' | 'review' | 'done';

interface BulkImportResult {
  totalRequested: number;
  created: number;
  failed: number;
  createdRows: { index: number; admissionNumber: string; studentId: string; guardianWarning?: string }[];
  failedRows: { index: number; admissionNumber: string; error: string }[];
}

const makeId = () => Math.random().toString(36).slice(2, 10);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_GRADES = new Set<string>(grades);

const emptyRow = (): BulkRow => ({
  id: makeId(),
  admissionNumber: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  admissionDate: new Date().toISOString().slice(0, 10),
  gradeLevel: '',
  guardianFirstName: '',
  guardianLastName: '',
  guardianRelationship: '',
  guardianPhone: '',
  studentEmail: '',
  errors: {},
});

function validateRow(row: BulkRow): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!row.admissionNumber.trim()) errors.admissionNumber = 'Required';
  if (!row.firstName.trim()) errors.firstName = 'Required';
  if (!row.lastName.trim()) errors.lastName = 'Required';

  if (!row.dateOfBirth.trim()) errors.dateOfBirth = 'Required';
  else if (Number.isNaN(new Date(row.dateOfBirth).getTime())) errors.dateOfBirth = 'Invalid date (YYYY-MM-DD)';

  if (!row.gender.trim()) errors.gender = 'Required';
  else if (!['MALE', 'FEMALE'].includes(row.gender.toUpperCase())) errors.gender = 'Must be MALE or FEMALE';

  if (!row.admissionDate.trim()) errors.admissionDate = 'Required';
  else if (Number.isNaN(new Date(row.admissionDate).getTime())) errors.admissionDate = 'Invalid date (YYYY-MM-DD)';

  if (!row.gradeLevel.trim()) errors.gradeLevel = 'Required';
  else if (!VALID_GRADES.has(row.gradeLevel.toUpperCase())) errors.gradeLevel = 'Invalid grade level';

  if (!row.guardianFirstName.trim()) errors.guardianFirstName = 'Required';
  if (!row.guardianLastName.trim()) errors.guardianLastName = 'Required';
  if (!row.guardianRelationship.trim()) errors.guardianRelationship = 'Required';
  if (!row.guardianPhone.trim()) errors.guardianPhone = 'Required';

  if (row.studentEmail.trim() && !EMAIL_RE.test(row.studentEmail.trim())) errors.studentEmail = 'Invalid email';

  return errors;
}

// ─── Excel template + parsing (SheetJS `xlsx`) — mirrors the web portal's
// bulk-import wizard. Two real gaps stay dropped here, same as before: no
// Guardian Email column (no such column on this device's guardian schema)
// and no login-credential output on the results step (no online account
// system on an offline device to issue credentials from). ──

const HEADERS: string[] = [
  'Admission Number *', 'First Name *', 'Last Name *', 'Date of Birth * (YYYY-MM-DD)',
  'Gender * (MALE/FEMALE)', 'Admission Date * (YYYY-MM-DD)', 'Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)',
  'Guardian First Name *', 'Guardian Last Name *', 'Guardian Relationship *', 'Guardian Phone *', 'Student Email',
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
    'STU-2024-001', 'John', 'Doe', '2010-05-15', 'MALE', new Date().toISOString().slice(0, 10),
    'GRADE_5', 'Jane', 'Doe', 'Mother', '+231770123456', 'john.doe@example.com',
  ];
  const studentsSheet = XLSX.utils.aoa_to_sheet([HEADERS, example]);
  studentsSheet['!cols'] = HEADERS.map(() => ({ wch: 30 }));

  // Reference sheet values come straight from the real gender/grade options
  // used elsewhere on this page, so it can't drift out of sync with them.
  const genderValues = ['MALE', 'FEMALE'];
  const refRows: string[][] = [['Valid Genders', 'Valid Grade Levels']];
  for (let i = 0; i < Math.max(genderValues.length, grades.length); i += 1) {
    refRows.push([genderValues[i] ?? '', grades[i] ?? '']);
  }
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 15 }, { wch: 15 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, studentsSheet, 'Students');
  XLSX.utils.book_append_sheet(wb, refSheet, 'Reference');
  XLSX.writeFile(wb, 'student-bulk-import-template.xlsx');
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
      const adm = pick(r, 'Admission Number *', 'Admission Number', 'admissionNumber');
      return adm && adm !== 'STU-2024-001' && !adm.toLowerCase().startsWith('example');
    })
    .map((r) => {
      const row: BulkRow = {
        id: makeId(),
        admissionNumber: pick(r, 'Admission Number *', 'Admission Number', 'admissionNumber'),
        firstName: pick(r, 'First Name *', 'First Name', 'firstName'),
        lastName: pick(r, 'Last Name *', 'Last Name', 'lastName'),
        dateOfBirth: parseDateCell(r['Date of Birth * (YYYY-MM-DD)'] ?? r['Date of Birth'] ?? r['dateOfBirth'] ?? ''),
        gender: pick(r, 'Gender * (MALE/FEMALE)', 'Gender', 'gender').toUpperCase(),
        admissionDate: parseDateCell(r['Admission Date * (YYYY-MM-DD)'] ?? r['Admission Date'] ?? r['admissionDate'] ?? ''),
        gradeLevel: pick(r, 'Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)', 'Grade Level', 'gradeLevel').toUpperCase(),
        guardianFirstName: pick(r, 'Guardian First Name *', 'Guardian First Name', 'guardianFirstName'),
        guardianLastName: pick(r, 'Guardian Last Name *', 'Guardian Last Name', 'guardianLastName'),
        guardianRelationship: pick(r, 'Guardian Relationship *', 'Guardian Relationship', 'guardianRelationship'),
        guardianPhone: pick(r, 'Guardian Phone *', 'Guardian Phone', 'guardianPhone'),
        studentEmail: pick(r, 'Student Email', 'studentEmail'),
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
  const listVm = useStudentsListViewModel();
  const profileVm = useStudentProfileViewModel();
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

  const handleSubmit = async () => {
    if (validRows.length === 0 || !institutionId || isSubmitting) return;
    setIsSubmitting(true);
    const createdRows: BulkImportResult['createdRows'] = [];
    const failedRows: BulkImportResult['failedRows'] = [];

    // Sequential, not parallel — each row needs its own createStudent +
    // createGuardian round trip through the ViewModel/IPC layer, and running
    // them one at a time keeps per-row error attribution honest.
    for (let index = 0; index < validRows.length; index += 1) {
      const row = validRows[index]!;
      try {
        const studentOutcome = await listVm.createStudent({
          institutionId,
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          admissionNumber: row.admissionNumber.trim(),
          admissionDate: row.admissionDate.trim() || undefined,
          dateOfBirth: row.dateOfBirth.trim(),
          gender: row.gender.toUpperCase() as 'MALE' | 'FEMALE',
          gradeLevel: row.gradeLevel.toUpperCase() as GradeLevelValue,
          email: row.studentEmail.trim() || undefined,
        });
        if (!studentOutcome.ok) {
          failedRows.push({ index, admissionNumber: row.admissionNumber, error: 'Could not create student record.' });
          continue;
        }
        let guardianWarning: string | undefined;
        const guardianOutcome = await profileVm.createGuardian({
          studentId: studentOutcome.data.id,
          firstName: row.guardianFirstName.trim(),
          lastName: row.guardianLastName.trim(),
          relationship: row.guardianRelationship.trim(),
          phoneNumber: row.guardianPhone.trim(),
          isPrimary: true,
        });
        if (!guardianOutcome.ok) guardianWarning = 'Student created, but the guardian record failed — add it manually.';
        createdRows.push({ index, admissionNumber: row.admissionNumber, studentId: studentOutcome.data.id, guardianWarning });
      } catch (cause) {
        failedRows.push({
          index, admissionNumber: row.admissionNumber,
          error: cause instanceof Error ? cause.message : 'Unexpected error creating this student.',
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
            Download the template, fill in student details, upload, review, then import. Each row creates a real
            offline student record plus a primary guardian, stored on this device and synced like any other change.
          </p>
        </div>

        {step === 'upload' && (
          <div className="max-w-2xl">
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Step 1 — Download Template</h2>
              <p className="mb-4 text-sm text-gray-600">
                Only required fields are marked with <strong>*</strong>. Grade level accepts KG, K1, K2, or GRADE_1
                through GRADE_12.
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
                <button type="button" onClick={handleSubmit} disabled={validRows.length === 0 || isSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {isSubmitting ? 'Importing…' : `Import ${validRows.length} Student${validRows.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">#</th>
                    <th className="min-w-[120px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Admission No *</th>
                    <th className="min-w-[100px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">First Name *</th>
                    <th className="min-w-[100px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Last Name *</th>
                    <th className="min-w-[110px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">DOB *</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Gender *</th>
                    <th className="min-w-[110px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Adm. Date *</th>
                    <th className="min-w-[130px] whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-gray-600">Grade Level *</th>
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
                          <input type="text" value={row.admissionNumber} placeholder="STU-001"
                            onChange={(e) => updateRow(row.id, { admissionNumber: e.target.value })}
                            className={inputClass(Boolean(row.errors.admissionNumber))} />
                          {row.errors.admissionNumber && <p className="mt-0.5 text-xs text-red-500">{row.errors.admissionNumber}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="text" value={row.firstName} placeholder="First name"
                            onChange={(e) => updateRow(row.id, { firstName: e.target.value })}
                            className={inputClass(Boolean(row.errors.firstName))} />
                          {row.errors.firstName && <p className="mt-0.5 text-xs text-red-500">{row.errors.firstName}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="text" value={row.lastName} placeholder="Last name"
                            onChange={(e) => updateRow(row.id, { lastName: e.target.value })}
                            className={inputClass(Boolean(row.errors.lastName))} />
                          {row.errors.lastName && <p className="mt-0.5 text-xs text-red-500">{row.errors.lastName}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="date" value={row.dateOfBirth}
                            onChange={(e) => updateRow(row.id, { dateOfBirth: e.target.value })}
                            className={inputClass(Boolean(row.errors.dateOfBirth))} />
                          {row.errors.dateOfBirth && <p className="mt-0.5 text-xs text-red-500">{row.errors.dateOfBirth}</p>}
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
                          <input type="date" value={row.admissionDate}
                            onChange={(e) => updateRow(row.id, { admissionDate: e.target.value })}
                            className={inputClass(Boolean(row.errors.admissionDate))} />
                          {row.errors.admissionDate && <p className="mt-0.5 text-xs text-red-500">{row.errors.admissionDate}</p>}
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
                          <input type="text" value={row.guardianFirstName} placeholder="First name"
                            onChange={(e) => updateRow(row.id, { guardianFirstName: e.target.value })}
                            className={inputClass(Boolean(row.errors.guardianFirstName))} />
                          {row.errors.guardianFirstName && <p className="mt-0.5 text-xs text-red-500">{row.errors.guardianFirstName}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="text" value={row.guardianLastName} placeholder="Last name"
                            onChange={(e) => updateRow(row.id, { guardianLastName: e.target.value })}
                            className={inputClass(Boolean(row.errors.guardianLastName))} />
                          {row.errors.guardianLastName && <p className="mt-0.5 text-xs text-red-500">{row.errors.guardianLastName}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="text" value={row.guardianRelationship} placeholder="Mother"
                            onChange={(e) => updateRow(row.id, { guardianRelationship: e.target.value })}
                            className={inputClass(Boolean(row.errors.guardianRelationship))} />
                          {row.errors.guardianRelationship && <p className="mt-0.5 text-xs text-red-500">{row.errors.guardianRelationship}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="tel" value={row.guardianPhone} placeholder="+231770000000"
                            onChange={(e) => updateRow(row.id, { guardianPhone: e.target.value })}
                            className={inputClass(Boolean(row.errors.guardianPhone))} />
                          {row.errors.guardianPhone && <p className="mt-0.5 text-xs text-red-500">{row.errors.guardianPhone}</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="email" value={row.studentEmail} placeholder="student@email.com"
                            onChange={(e) => updateRow(row.id, { studentEmail: e.target.value })}
                            className={inputClass(Boolean(row.errors.studentEmail))} />
                          {row.errors.studentEmail && <p className="mt-0.5 text-xs text-red-500">{row.errors.studentEmail}</p>}
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
              <button type="button" onClick={handleSubmit} disabled={validRows.length === 0 || isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {isSubmitting ? 'Importing…' : `Import ${validRows.length} Valid Student${validRows.length !== 1 ? 's' : ''}`}
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
                <h3 className="mb-1 text-base font-semibold text-gray-900">Created Students</h3>
                <p className="mb-4 text-sm text-gray-600">
                  Each row created a real offline student record with a primary guardian. There are no login
                  credentials to share — this device has no online account system to issue them from.
                </p>
                <div className="space-y-2">
                  {result.createdRows.map((c) => (
                    <div key={c.index} className="flex items-start gap-2 rounded-lg bg-green-50 p-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      <div>
                        <p className="text-sm font-medium text-green-800">{c.admissionNumber}</p>
                        {c.guardianWarning && <p className="mt-0.5 text-xs text-amber-700">{c.guardianWarning}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.failedRows.length > 0 && (
              <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-1 text-base font-semibold text-red-700">Failed Students</h3>
                <div className="mt-3 space-y-2">
                  {result.failedRows.map((f) => (
                    <div key={f.index} className="flex items-start gap-2 rounded-lg bg-red-50 p-3">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-red-800">{f.admissionNumber || `Row ${f.index + 1}`}</p>
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
                    const failedNums = new Set(result.failedRows.map((f) => f.admissionNumber));
                    setRows((prev) => prev.filter((r) => failedNums.has(r.admissionNumber)).map((r) => ({ ...r, errors: validateRow(r) })));
                    setStep('review');
                    setResult(null);
                  }}
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
