'use client';

import Link from 'next/link';
import { matchPriorRecordHref, useLocalPendingCarryOvers } from './use-local-pending-carry-overs';

/** School admin dashboard: transferred-in students whose prior record still
 * needs matching. Hidden when there are none. */
export function PriorRecordsToMatchCard() {
  const rows = useLocalPendingCarryOvers();
  if (rows.length === 0) return null;
  return (
    <section className="bg-white border border-slate-300 rounded-card p-6">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Prior records to match</h2>
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3">
            <span className="text-slate-800">
              {row.studentName} — from {row.fromInstitutionName}
            </span>
            <Link href={matchPriorRecordHref(row.id)} className="text-blue-700 hover:underline">
              Match
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
