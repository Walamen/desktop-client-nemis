'use client';

import Link from 'next/link';
import { matchPriorRecordHref, useLocalPendingCarryOvers } from './use-local-pending-carry-overs';

/** Student profile: shown while this student's prior record is unmatched. */
export function PriorRecordBanner({ studentId }: { studentId: string }) {
  const task = useLocalPendingCarryOvers().find((row) => row.studentId === studentId);
  if (!task) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p>
        {task.studentName}&apos;s prior record from {task.fromInstitutionName} has not been matched yet.
      </p>
      <Link
        href={matchPriorRecordHref(task.id)}
        className="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
      >
        Match prior record
      </Link>
    </div>
  );
}
