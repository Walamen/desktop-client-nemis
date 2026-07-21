import { Card } from '@nemis-desktop/ui';

/** A single labelled fact. When `value` is null/empty it renders `emptyText`
 * in a muted style — never a fabricated number. */
export function InfoTile({
  label,
  value,
  emptyText,
}: {
  label: string;
  value: string | number | null;
  emptyText: string;
}) {
  const isEmpty = value === null || value === '';
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      {isEmpty ? (
        <p className="mt-2 text-sm italic text-slate-500">{emptyText}</p>
      ) : (
        <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      )}
    </Card>
  );
}
