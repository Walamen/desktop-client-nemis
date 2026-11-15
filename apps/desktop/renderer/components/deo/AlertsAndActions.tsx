'use client';

import { AlertTriangle, AlertCircle, Clock } from 'lucide-react';
import type { DeoAlert } from '@nemis-desktop/types';

interface AlertsAndActionsProps {
  alerts: DeoAlert[];
  totalCount: number;
  isLoading?: boolean;
}

function severityConfig(severity: string) {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return {
        icon: AlertCircle,
        bgColor: 'bg-red-50',
        textColor: 'text-red-600',
        borderColor: 'border-red-600',
        badgeColor: 'bg-red-100 text-red-700',
        label: 'Critical',
      };
    case 'HIGH':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-orange-50',
        textColor: 'text-orange-600',
        borderColor: 'border-orange-600',
        badgeColor: 'bg-orange-100 text-orange-700',
        label: 'Pending',
      };
    case 'MEDIUM':
      return {
        icon: Clock,
        bgColor: 'bg-yellow-50',
        textColor: 'text-yellow-600',
        borderColor: 'border-yellow-600',
        badgeColor: 'bg-yellow-100 text-yellow-700',
        label: 'Needs Review',
      };
    case 'LOW':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-600',
        borderColor: 'border-blue-600',
        badgeColor: 'bg-blue-100 text-blue-700',
        label: 'Info',
      };
    default:
      return {
        icon: AlertCircle,
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-600',
        borderColor: 'border-gray-600',
        badgeColor: 'bg-gray-100 text-gray-700',
        label: severity || 'Unknown',
      };
  }
}

/** Ported from portal-web components/deo/AlertsAndActions.tsx. The border
 * colour is a literal class so Tailwind's scanner can see it. */
export function AlertsAndActions({ alerts, totalCount, isLoading }: AlertsAndActionsProps) {
  return (
    <div data-section className="bg-white rounded-lg border border-gray-300 overflow-hidden font-['Sora']">
      <div className="bg-secondary/20 p-6 border-b border-gray-300">
        <div className="flex items-center justify-between gap-8">
          <h3 className="text-lg font-bold text-gray-700">Alerts &amp; Actions</h3>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-button text-xs font-semibold bg-active text-slate-100">
            {totalCount} Items
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-200 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="p-4 animate-pulse space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No alerts or incidents</p>
          </div>
        ) : (
          alerts.map((item) => {
            const config = severityConfig(item.severity);
            const Icon = config.icon;
            return (
              <div
                key={item.id}
                className={`p-4 hover:bg-gray-50 transition-colors ${config.bgColor} border-l-4 ${config.borderColor}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 ${config.textColor} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-600 mt-1">{item.description || item.type}</p>
                      </div>
                      <span
                        className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${config.badgeColor}`}
                      >
                        {config.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
