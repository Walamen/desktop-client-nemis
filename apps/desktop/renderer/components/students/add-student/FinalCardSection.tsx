'use client';
import type { RegistryHit } from '@nemis-desktop/types';
import { ReportCardView } from '../../report-cards/ReportCardView';

/** The child's last FINAL report card, so the admin sees where they stand
 * before choosing a grade. */
export function FinalCardSection({ hit }: { hit: RegistryHit }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">Last final report card</h3>
      {hit.finalCard ? (
        <ReportCardView payload={hit.finalCard.payload} version={hit.finalCard.version} />
      ) : (
        <p className="text-sm text-slate-600">No final report card yet</p>
      )}
    </section>
  );
}
