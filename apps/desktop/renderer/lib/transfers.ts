import { isLapsed } from '@nemis-desktop/shared';
import type { SchoolAdminRecord } from '@nemis-desktop/types';

/** A typed view of one local `student_transfers` row. */
export interface LocalTransfer {
  id: string;
  studentId: string;
  fromInstitutionId: string;
  toInstitutionId: string;
  status: string;
  initiatedBy: string;
  lapsesAt: string | null;
  classId: string | null;
  termId: string | null;
  toGradeLevel: string | null;
  reason: string | null;
  reviewNotes: string | null;
  requestedDate: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  studentName: string | null;
  studentNemisId: string | null;
  fromInstitutionName: string | null;
  toInstitutionName: string | null;
}

export type TransferAction = 'approve' | 'reject' | 'release' | 'cancel' | 'complete' | 'withdraw';

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function toLocalTransfer(record: SchoolAdminRecord): LocalTransfer | null {
  const id = str(record.id);
  const studentId = str(record.studentId);
  const fromInstitutionId = str(record.fromInstitutionId);
  const toInstitutionId = str(record.toInstitutionId);
  if (!id || !studentId || !fromInstitutionId || !toInstitutionId) return null;
  return {
    id,
    studentId,
    fromInstitutionId,
    toInstitutionId,
    status: str(record.status) ?? 'PENDING',
    initiatedBy: str(record.initiatedBy) ?? 'ORIGIN_SCHOOL',
    lapsesAt: str(record.lapsesAt),
    classId: str(record.classId),
    termId: str(record.termId),
    toGradeLevel: str(record.toGradeLevel),
    reason: str(record.reason),
    reviewNotes: str(record.reviewNotes),
    requestedDate: str(record.requestedDate),
    reviewedAt: str(record.reviewedAt),
    createdAt: str(record.createdAt),
    studentName: str(record.studentName),
    studentNemisId: str(record.studentNemisId),
    fromInstitutionName: str(record.fromInstitutionName),
    toInstitutionName: str(record.toInstitutionName),
  };
}

const lapsedAt = (row: LocalTransfer, now: number) => isLapsed(row, now);

/**
 * Split by who asked. Requests to us: to us and origin-initiated (a push), or
 * from us and receiving-initiated (a pull). Ours: the mirror image. Rows
 * involving neither side are dropped.
 */
export function splitByWhoAsked(
  rows: LocalTransfer[],
  us: string,
): { requestsToUs: LocalTransfer[]; ourRequests: LocalTransfer[] } {
  const requestsToUs: LocalTransfer[] = [];
  const ourRequests: LocalTransfer[] = [];
  for (const r of rows) {
    const toUs = r.toInstitutionId === us;
    const fromUs = r.fromInstitutionId === us;
    const receiving = r.initiatedBy === 'RECEIVING_SCHOOL';
    if ((toUs && !receiving) || (fromUs && receiving)) requestsToUs.push(r);
    else if ((toUs && receiving) || (fromUs && !receiving)) ourRequests.push(r);
  }
  return { requestsToUs, ourRequests };
}

/** Pending and not lapsed; a lapsed row is no longer awaiting our decision. */
export function countPendingDecisions(requestsToUs: LocalTransfer[], now: number): number {
  return requestsToUs.filter((r) => r.status === 'PENDING' && !lapsedAt(r, now)).length;
}

/** Spec section 8.3 action matrix. */
export function actionsFor(row: LocalTransfer, us: string, now: number): TransferAction[] {
  if (row.status !== 'PENDING') return [];
  const lapsed = lapsedAt(row, now);
  const receiving = row.initiatedBy === 'RECEIVING_SCHOOL';
  const toUs = row.toInstitutionId === us;
  const fromUs = row.fromInstitutionId === us;
  const asksOfUs = (toUs && !receiving) || (fromUs && receiving);
  const askedByUs = (toUs && receiving) || (fromUs && !receiving);
  if (asksOfUs) {
    if (!receiving) return ['approve', 'reject'];
    return lapsed ? [] : ['release', 'reject'];
  }
  if (askedByUs) {
    if (lapsed) return ['complete', 'withdraw'];
    return ['cancel'];
  }
  return [];
}

export function needsPlacement(row: LocalTransfer): boolean {
  return !row.classId || !row.termId;
}

const listeners = new Set<() => void>();

export function onTransfersChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyTransfersChanged(): void {
  for (const l of [...listeners]) l();
}
