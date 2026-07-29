import { nemisBridge } from '@/services/nemis-bridge';
import type { SchoolAdminRecord } from '@nemis-desktop/types';

export const human = (value: string): string =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export const LEVEL_LABEL: Record<string, string> = {
  PRE_PRIMARY: 'Pre-Primary',
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
  CERTIFICATE: 'Certificate',
  DIPLOMA: 'Diploma',
  UNDERGRADUATE: 'Undergraduate',
  POSTGRADUATE: 'Postgraduate',
};

export const FEE_CATEGORIES = ['TUITION', 'ACTIVITY', 'TRANSPORT', 'UNIFORM', 'BOOKS', 'LUNCH', 'EXAM', 'OTHER'] as const;

/** `applicableLevels` is stored as a comma-separated string — SchoolAdminRecord
 * values are limited to string | number | boolean | null, so arrays can't be
 * persisted directly through the generic collection API. */
export function parseLevels(value: SchoolAdminRecord[string] | undefined): string[] {
  if (typeof value !== 'string' || !value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

export function stringifyLevels(levels: readonly string[]): string {
  return levels.join(',');
}

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CHEQUE', label: 'Cheque' },
] as const;

export const OBLIGATION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  OUTSTANDING: { label: 'Outstanding', className: 'bg-error/10 text-error' },
  PARTIALLY_PAID: { label: 'Partial', className: 'bg-pending/10 text-pending' },
  PAID_IN_FULL: { label: 'Paid', className: 'bg-active/10 text-active' },
  WAIVED: { label: 'Waived', className: 'bg-slate-100 text-slate-500' },
};

/** Mirrors portal-web's formatCurrency (Intl.NumberFormat currency style). */
export function formatCurrency(amount: number, currency = 'LRD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Buckets a GradeLevel into the coarse InstitutionLevel groups fee rules are
 * scoped to — mirrors portal-web's inline gradeToLevel in record-payment. */
export function gradeToLevel(grade: string | null | undefined): string | null {
  if (!grade) return null;
  if (['KG', 'K1', 'K2'].includes(grade)) return 'PRE_PRIMARY';
  if (['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6'].includes(grade)) return 'PRIMARY';
  if (['GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12'].includes(grade)) return 'SECONDARY';
  return null;
}

/** All rows for a collection, paged through the generic offline API and
 * filtered client-side — the collection API has no server-side filter
 * beyond pagination (same pattern used throughout classes/academic-grading
 * shared helpers). */
async function listAll(collection: 'fee_rules' | 'fee_obligations' | 'fee_payments'): Promise<SchoolAdminRecord[]> {
  const result = await nemisBridge.listSchoolAdminRecords({ collection, limit: 250 });
  return result.items;
}

export const listFeeRules = () => listAll('fee_rules');

export async function saveFeeRule(record: SchoolAdminRecord): Promise<SchoolAdminRecord> {
  return nemisBridge.saveSchoolAdminRecord({ collection: 'fee_rules', record });
}

export async function listObligationsForRule(feeRuleId: string): Promise<SchoolAdminRecord[]> {
  const rows = await listAll('fee_obligations');
  return rows.filter((row) => row.feeRuleId === feeRuleId);
}

export interface FeeRuleSummary {
  totalStudents: number;
  outstandingCount: number;
  partialCount: number;
  paidCount: number;
  totalCollected: number;
  totalRequired: number;
}

export function computeFeeRuleSummary(obligations: SchoolAdminRecord[]): FeeRuleSummary {
  let outstandingCount = 0, partialCount = 0, paidCount = 0, totalCollected = 0, totalRequired = 0;
  for (const row of obligations) {
    const status = String(row.status);
    if (status === 'OUTSTANDING') outstandingCount += 1;
    else if (status === 'PARTIALLY_PAID') partialCount += 1;
    else if (status === 'PAID_IN_FULL' || status === 'WAIVED') paidCount += 1;
    totalCollected += Number(row.totalPaid ?? 0);
    totalRequired += Number(row.requiredAmount ?? 0);
  }
  return { totalStudents: obligations.length, outstandingCount, partialCount, paidCount, totalCollected, totalRequired };
}

/** Finds an existing obligation for this student/rule/term, or creates one —
 * mirrors portal-web's useGetOrCreateObligation, built directly on the real,
 * mutable fee_obligations collection (institutionId is injected server-side
 * for INSTITUTION_ADMIN writes, so it's omitted here). */
export async function getOrCreateObligation(params: {
  studentId: string;
  feeRuleId: string;
  academicYearId: string;
  termId: string;
  requiredAmount: number;
}): Promise<SchoolAdminRecord> {
  const rows = await listAll('fee_obligations');
  const existing = rows.find(
    (row) => row.studentId === params.studentId && row.feeRuleId === params.feeRuleId && row.termId === params.termId,
  );
  if (existing) return existing;
  return nemisBridge.saveSchoolAdminRecord({
    collection: 'fee_obligations',
    record: {
      studentId: params.studentId,
      feeRuleId: params.feeRuleId,
      academicYearId: params.academicYearId,
      termId: params.termId,
      requiredAmount: params.requiredAmount,
      totalPaid: 0,
      status: 'OUTSTANDING',
      dueDate: null,
      notes: null,
    },
  });
}

export interface BulkAssignResult {
  created: number;
  skipped: number;
  errors: { studentId: string; reason: string }[];
}

/** Mirrors portal-web's assignBulk mutation (BulkAssignObligationsModal) —
 * idempotent per student: skips anyone who already has an obligation for
 * this rule + term. */
export async function bulkAssignObligations(params: {
  feeRuleId: string;
  academicYearId: string;
  termId: string;
  requiredAmount: number;
  studentIds: string[];
}): Promise<BulkAssignResult> {
  const existingRows = await listAll('fee_obligations');
  const existingStudentIds = new Set(
    existingRows.filter((row) => row.feeRuleId === params.feeRuleId && row.termId === params.termId).map((row) => row.studentId),
  );
  const result: BulkAssignResult = { created: 0, skipped: 0, errors: [] };
  for (const studentId of params.studentIds) {
    if (existingStudentIds.has(studentId)) {
      result.skipped += 1;
      continue;
    }
    try {
      await nemisBridge.saveSchoolAdminRecord({
        collection: 'fee_obligations',
        record: {
          studentId,
          feeRuleId: params.feeRuleId,
          academicYearId: params.academicYearId,
          termId: params.termId,
          requiredAmount: params.requiredAmount,
          totalPaid: 0,
          status: 'OUTSTANDING',
          dueDate: null,
          notes: null,
        },
      });
      result.created += 1;
    } catch (cause) {
      result.errors.push({ studentId, reason: cause instanceof Error ? cause.message : 'Failed to assign obligation.' });
    }
  }
  return result;
}

export async function listPaymentsForObligation(obligationId: string): Promise<SchoolAdminRecord[]> {
  const rows = await listAll('fee_payments');
  return rows.filter((row) => row.obligationId === obligationId).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
}

/** Records a real, append-only payment. The generic collection service
 * automatically rolls the amount into the obligation's totalPaid/status —
 * no separate obligation update needed here (see SchoolAdminModuleService's
 * fee_payments save branch). */
export async function recordPayment(params: {
  obligationId: string;
  studentId: string;
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
}): Promise<SchoolAdminRecord> {
  return nemisBridge.saveSchoolAdminRecord({
    collection: 'fee_payments',
    record: {
      obligationId: params.obligationId,
      studentId: params.studentId,
      amount: params.amount,
      method: params.method,
      reference: params.reference || null,
      notes: params.notes || null,
      receiptNumber: `OFF-${Date.now()}`,
      recordedBy: '',
      isReversed: false,
      paidAt: new Date().toISOString(),
    },
  });
}
