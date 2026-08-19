'use client';

import { ErrorState } from '@nemis-desktop/ui';
import { useSchoolsViewModel } from '@/lib/presentation/hooks/county';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

export default function CountySchoolsPage() {
  const schools = useSchoolsViewModel();
  const institutions = useViewModel(schools.store, (s) => s.institutions);

  useRevalidateOnSync(() => void schools.loadInstitutions(), [schools]);

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            County
          </p>
          <h1 className="text-xl font-bold text-slate-900">Schools</h1>
        </div>

        {institutions.status === 'error' ? (
          <ErrorState
            message={institutions.error.userMessage}
            onRetry={() => void schools.loadInstitutions()}
          />
        ) : institutions.status === 'loading' || institutions.status === 'idle' ? (
          <div className="bg-white border border-slate-300 rounded-card p-12 text-center text-sm text-slate-400">
            Loading schools…
          </div>
        ) : institutions.status === 'empty' ? (
          <div className="bg-white border border-slate-300 rounded-card p-12 text-center text-sm text-slate-400">
            No schools have synced to this device yet.
          </div>
        ) : (
          <div className="bg-white border rounded-lg border-slate-300 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/20 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">School</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">District</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Enrolled</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {institutions.data.map((school) => (
                  <tr key={school.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">{school.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{school.code}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{school.districtName ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 text-right">{school.studentCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-slate-600 bg-slate-100">
                        {school.approvalStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
