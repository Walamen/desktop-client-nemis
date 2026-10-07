import Link from 'next/link';
import { Card } from '@nemis-desktop/ui';

/** A single labelled fact. When `value` is null/empty it renders `emptyText`
 * in a muted style — never a fabricated number. With `emptyHref`, the empty
 * text becomes a link to the page where the missing thing is set up. */
export function InfoTile({
  label,
  value,
  emptyText,
  emptyHref,
}: {
  label: string;
  value: string | number | null;
  emptyText: string;
  emptyHref?: string;
}) {
  const isEmpty = value === null || value === '';
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      {!isEmpty ? (
        <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      ) : emptyHref ? (
        <Link href={emptyHref} className="mt-2 inline-block text-sm text-blue-700 hover:underline">
          {emptyText}
          <span aria-hidden> →</span>
        </Link>
      ) : (
        <p className="mt-2 text-sm italic text-slate-500">{emptyText}</p>
      )}
    </Card>
  );
}
