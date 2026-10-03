import * as XLSX from 'xlsx';
import type { BulkClaimResult, BulkClaimRow, Gender, GradeLevel } from '@nemis-desktop/types';
import { normalizeNemisId } from '@nemis-desktop/shared';
import { grades } from '../shared';

export interface BulkRow {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  admissionDate: string;
  gradeLevel: string;
  /** Raw cell text; blank means create locally, otherwise claim online. */
  nemisId: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianRelationship: string;
  guardianPhone: string;
  studentEmail: string;
  errors: Record<string, string>;
}

export const makeId = () => Math.random().toString(36).slice(2, 10);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_GRADES = new Set<string>(grades);
export const NEMIS_ID_HEADER = 'NEMIS ID (leave blank for new students)';

export function validateRow(row: BulkRow): Record<string, string> {
  const errors: Record<string, string> = {};
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

  if (row.nemisId.trim() && normalizeNemisId(row.nemisId) === null) errors.nemisId = 'Invalid NEMIS ID (12 digits, check digit)';

  if (row.studentEmail.trim() && !EMAIL_RE.test(row.studentEmail.trim())) errors.studentEmail = 'Invalid email';

  return errors;
}

// ─── Excel template + parsing (SheetJS `xlsx`) — mirrors the web portal's
// bulk-import wizard. Two real gaps stay dropped here, same as before: no
// Guardian Email column (no such column on this device's guardian schema)
// and no login-credential output on the results step (no online account
// system on an offline device to issue credentials from). ──

export const HEADERS: string[] = [
  'First Name *', 'Last Name *', 'Date of Birth * (YYYY-MM-DD)',
  'Gender * (MALE/FEMALE)', 'Admission Date * (YYYY-MM-DD)', 'Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)',
  NEMIS_ID_HEADER,
  'Guardian First Name *', 'Guardian Last Name *', 'Guardian Relationship *', 'Guardian Phone *', 'Student Email',
];

/** Normalizes an Excel date cell (real `Date` when `cellDates: true`, or a
 * plain string typed by hand) down to `YYYY-MM-DD`. */
export function parseDateCell(value: unknown): string {
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

export function downloadTemplate(): void {
  const example = [
    'John', 'Doe', '2010-05-15', 'MALE', new Date().toISOString().slice(0, 10),
    'GRADE_5', '', 'Jane', 'Doe', 'Mother', '+231770123456', 'john.doe@example.com',
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

/** A numeric Excel cell drops leading zeros (~10% of IDs start with 0), so
 * left-pad numbers to 12 digits; Luhn validation still decides validity. */
export function parseNemisIdCell(value: unknown): string {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return String(value).padStart(12, '0');
  return value === undefined || value === null ? '' : String(value).trim();
}

export function pick(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== '') return String(value).trim();
  }
  return '';
}

/** Reads the first sheet of an uploaded workbook. `XLSX.read` with
 * `type: 'array'` auto-detects the underlying format, so this also accepts
 * plain .csv files uploaded through the same picker — not just .xlsx. */
export function parseWorkbookToRows(data: Uint8Array): BulkRow[] {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  return raw
    .filter((r) => {
      const firstName = pick(r, 'First Name *', 'First Name', 'firstName');
      return firstName && firstName !== 'John';
    })
    .map((r) => {
      const row: BulkRow = {
        id: makeId(),
        firstName: pick(r, 'First Name *', 'First Name', 'firstName'),
        lastName: pick(r, 'Last Name *', 'Last Name', 'lastName'),
        dateOfBirth: parseDateCell(r['Date of Birth * (YYYY-MM-DD)'] ?? r['Date of Birth'] ?? r['dateOfBirth'] ?? ''),
        gender: pick(r, 'Gender * (MALE/FEMALE)', 'Gender', 'gender').toUpperCase(),
        admissionDate: parseDateCell(r['Admission Date * (YYYY-MM-DD)'] ?? r['Admission Date'] ?? r['admissionDate'] ?? ''),
        gradeLevel: pick(r, 'Grade Level * (KG/K1/K2/GRADE_1...GRADE_12)', 'Grade Level', 'gradeLevel').toUpperCase(),
        nemisId: parseNemisIdCell(r[NEMIS_ID_HEADER] ?? r['NEMIS ID'] ?? r['nemisId'] ?? ''),
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


// ─── Partitioning, claim mapping and the retry file ──

export interface IndexedRow {
  /** Position in the review list at submission. */
  originalIndex: number;
  row: BulkRow;
}

export interface RetryEntry {
  originalIndex: number;
  reason: string;
}

/** The server accepts 1..500 rows per bulk-claim call. */
export const MAX_CLAIM_ROWS = 500;

export function gradeMismatchMessage(rowGrade: string, classGrade: string): string {
  return `Grade level "${rowGrade}" does not match the selected class grade "${classGrade}"`;
}

export function partitionRows(
  rows: BulkRow[],
  classGrade: GradeLevel,
): { local: IndexedRow[]; claim: IndexedRow[]; failed: { originalIndex: number; error: string }[] } {
  const local: IndexedRow[] = [];
  const claim: IndexedRow[] = [];
  const failed: { originalIndex: number; error: string }[] = [];
  rows.forEach((row, originalIndex) => {
    if (Object.keys(row.errors).length > 0) return;
    if (row.gradeLevel.toUpperCase() !== String(classGrade).toUpperCase()) {
      failed.push({ originalIndex, error: gradeMismatchMessage(row.gradeLevel, String(classGrade)) });
      return;
    }
    if (!row.nemisId.trim()) local.push({ originalIndex, row });
    else claim.push({ originalIndex, row });
  });
  return { local, claim, failed };
}

export function splitClaimBatch(claim: IndexedRow[]): { send: IndexedRow[]; overflow: IndexedRow[] } {
  return { send: claim.slice(0, MAX_CLAIM_ROWS), overflow: claim.slice(MAX_CLAIM_ROWS) };
}

/** Same order as `claim`, so the server's `index` equals the position in `claim`. */
export function toBulkClaimRows(claim: IndexedRow[]): BulkClaimRow[] {
  return claim.map(({ row }) => {
    const out: BulkClaimRow = {
      nemisId: normalizeNemisId(row.nemisId) ?? row.nemisId,
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      dateOfBirth: row.dateOfBirth,
      gender: row.gender.toUpperCase() as Gender,
      gradeLevel: row.gradeLevel.toUpperCase() as GradeLevel,
      guardianFirstName: row.guardianFirstName.trim(),
      guardianLastName: row.guardianLastName.trim(),
      guardianPhone: row.guardianPhone.trim(),
    };
    if (row.admissionDate.trim()) out.admissionDate = row.admissionDate;
    if (row.guardianRelationship.trim()) out.guardianRelationship = row.guardianRelationship.trim();
    if (row.studentEmail.trim()) out.studentEmail = row.studentEmail.trim();
    return out;
  });
}

export const NOT_PROCESSED_REASON = 'The server did not process this row. Import it again.';

export function mapClaimOutcome(
  claim: IndexedRow[],
  result: BulkClaimResult,
): { claimed: { originalIndex: number; nemisId: string }[]; retry: RetryEntry[] } {
  const claimed = new Map<number, { originalIndex: number; nemisId: string }>();
  for (const c of result.created) {
    const entry = claim[c.index];
    if (entry) claimed.set(c.index, { originalIndex: entry.originalIndex, nemisId: c.nemisId });
  }
  const failedByIndex = new Map<number, string>();
  for (const f of result.failed) {
    if (claim[f.index]) failedByIndex.set(f.index, f.error);
  }
  const retry: RetryEntry[] = [];
  claim.forEach((entry, i) => {
    if (claimed.has(i)) return;
    retry.push({
      originalIndex: entry.originalIndex,
      reason: failedByIndex.get(i) ?? result.registryUnavailableMessage ?? NOT_PROCESSED_REASON,
    });
  });
  return { claimed: [...claimed.values()], retry };
}

export function allToRetry(claim: IndexedRow[], reason: string): RetryEntry[] {
  return claim.map((c) => ({ originalIndex: c.originalIndex, reason }));
}

export function buildRetryWorkbook(rows: BulkRow[], retry: RetryEntry[]): XLSX.WorkBook {
  const lines = [...retry]
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .flatMap((entry) => {
      const row = rows[entry.originalIndex];
      return row ? [{ row, reason: entry.reason }] : [];
    })
    .map(({ row, reason }) => [
      row.firstName, row.lastName, row.dateOfBirth, row.gender, row.admissionDate, row.gradeLevel,
      row.nemisId, row.guardianFirstName, row.guardianLastName, row.guardianRelationship,
      row.guardianPhone, row.studentEmail, reason,
    ]);
  const sheet = XLSX.utils.aoa_to_sheet([[...HEADERS, 'Reason'], ...lines]);
  sheet['!cols'] = [...HEADERS, 'Reason'].map(() => ({ wch: 30 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Students');
  return wb;
}

export function downloadRetryFile(rows: BulkRow[], retry: RetryEntry[]): void {
  XLSX.writeFile(buildRetryWorkbook(rows, retry), 'student-import-retry.xlsx');
}
