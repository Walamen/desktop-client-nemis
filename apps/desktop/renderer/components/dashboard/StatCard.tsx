import type { LucideIcon } from 'lucide-react';
import { Card, Skeleton } from '@nemis-desktop/ui';

export interface StatCardProps {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  valueClassName?: string;
  /** Shown instead of a loading skeleton when the stat has no repository-backed
   * source yet. Keeps the tile from ever displaying a fabricated number. */
  emptyText?: string;
}

/** A single dashboard KPI tile — mirrors the portal-web stat card exactly
 * (uppercase label, 4xl bold value, icon chip). `value === undefined` shows a
 * loading skeleton unless `emptyText` is supplied. */
export function StatCard({
  label,
  value,
  icon: Icon,
  valueClassName = 'text-slate-900',
  emptyText,
}: StatCardProps) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{label}</p>
      <div className="flex items-center justify-between">
        <div>
          {value === undefined ? (
            emptyText ? (
              <p className="text-sm italic text-slate-400 mt-2">{emptyText}</p>
            ) : (
              <Skeleton className="h-9 w-16 mt-1" />
            )
          ) : (
            <p className={`text-4xl font-bold ${valueClassName}`}>{value.toLocaleString()}</p>
          )}
        </div>
        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 text-slate-600" />
        </div>
      </div>
    </Card>
  );
}
