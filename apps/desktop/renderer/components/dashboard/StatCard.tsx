import type { LucideIcon } from 'lucide-react';
import { Card } from '@nemis-desktop/ui';
import type { DashboardStat } from '@nemis-desktop/presentation';

export function StatCard({ stat, icon: Icon }: { stat: DashboardStat; icon: LucideIcon }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{stat.label}</p>
        {stat.placeholder && (
          <span className="text-[10px] font-semibold uppercase text-pending" title="Sample data — not yet backed by a workflow">
            sample
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-4xl font-bold text-slate-900">{stat.value}</p>
        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
          <Icon className="w-6 h-6 text-slate-600" />
        </div>
      </div>
    </Card>
  );
}
