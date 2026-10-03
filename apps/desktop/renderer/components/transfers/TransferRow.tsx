'use client';
import { formatNemisId, isLapsed } from '@nemis-desktop/shared';
import { Button } from '@nemis-desktop/ui';
import { actionsFor, type LocalTransfer, type TransferAction } from '@/lib/transfers';
import { human } from '../students/shared';
import { ApproveForm, CompleteForm, ConfirmForm, RejectForm } from './TransferActionForms';
import { TransferStatusChip } from './TransferStatusChip';

const LABELS: Record<TransferAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  release: 'Release',
  cancel: 'Cancel',
  complete: 'Complete',
  withdraw: 'Withdraw',
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

/** One transfer: who, between which schools, why, when, its status, and the
 * actions the matrix allows. At most one action form is open (page-wide). */
export function TransferRow({
  row,
  us,
  now,
  ours,
  online,
  openAction,
  onOpen,
  onDone,
}: {
  row: LocalTransfer;
  us: string;
  now: number;
  ours: boolean;
  online: boolean;
  openAction: TransferAction | null;
  onOpen: (action: TransferAction | null) => void;
  onDone: (refreshed: boolean) => void;
}) {
  const studentLabel = row.studentName ?? row.studentId;
  const incoming = row.toInstitutionId === us;
  const otherSchool = incoming
    ? (row.fromInstitutionName ?? row.fromInstitutionId)
    : (row.toInstitutionName ?? row.toInstitutionId);
  const actions = actionsFor(row, us, now);
  const lapsed = isLapsed(row, now);
  const requested = day(row.requestedDate) ?? day(row.createdAt);
  const decided = day(row.reviewedAt);
  const lapses = row.status === 'PENDING' ? day(row.lapsesAt) : null;
  const noNemisId = !row.studentNemisId;
  // Another school's pull against us that has lapsed: no action is left for
  // us, so say why the row has no buttons.
  const lapsedAgainstUs =
    row.status === 'PENDING' && lapsed && row.initiatedBy === 'RECEIVING_SCHOOL' && row.fromInstitutionId === us;
  const form = { row, online, onClose: () => onOpen(null), onDone };

  return (
    <li aria-label={`Transfer of ${studentLabel}`} className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold text-slate-900">
            {studentLabel}{' '}
            {row.studentNemisId && (
              <span className="ml-1 font-mono text-xs font-normal text-slate-500">
                {formatNemisId(row.studentNemisId)}
              </span>
            )}
          </p>
          <p className="text-sm text-slate-700">{incoming ? `From ${otherSchool}` : `To ${otherSchool}`}</p>
          {row.reason && <p className="text-sm text-slate-600">Reason: {row.reason}</p>}
          {row.toGradeLevel && <p className="text-xs text-slate-500">Grade: {human(row.toGradeLevel)}</p>}
          <p className="text-xs text-slate-500">
            {[
              requested && `Requested ${requested}`,
              lapses && `Lapses ${lapses}`,
              decided && `Decided ${decided}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {row.reviewNotes && <p className="text-xs text-slate-500">Notes: {row.reviewNotes}</p>}
        </div>
        <TransferStatusChip status={row.status} lapsed={lapsed} ours={ours} />
      </div>
      {lapsedAgainstUs && (
        <p className="mt-3 text-xs text-slate-600">
          The 14-day window has passed — {otherSchool} can now complete this transfer.
        </p>
      )}
      {actions.length > 0 && openAction === null && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action}
                type="button"
                variant={action === 'approve' || action === 'release' || action === 'complete' ? 'primary' : 'secondary'}
                disabled={!online || (action === 'complete' && noNemisId)}
                onClick={() => onOpen(action)}
              >
                {LABELS[action]}
              </Button>
            ))}
          </div>
          {actions.includes('complete') && noNemisId && (
            <p className="text-xs text-amber-700">
              This student has no NEMIS ID on this device yet, so the transfer can&apos;t be completed here. Sync
              this device, or complete it on the web portal.
            </p>
          )}
        </div>
      )}
      {openAction === 'approve' && <ApproveForm {...form} />}
      {openAction === 'reject' && <RejectForm {...form} />}
      {openAction === 'complete' && <CompleteForm {...form} />}
      {(openAction === 'release' || openAction === 'cancel' || openAction === 'withdraw') && (
        <ConfirmForm {...form} kind={openAction} otherSchool={otherSchool} studentLabel={studentLabel} />
      )}
    </li>
  );
}
