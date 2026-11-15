'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Ban, CheckCircle, MessageSquare, Users } from 'lucide-react';
import { Avatar, Card, Spinner } from '@nemis-desktop/ui';
import {
  ADMIN_TABS,
  adminTabCounts,
  filterAdminsByTab,
  lastActiveLabel,
  type AdminTab,
} from '@nemis-desktop/presentation';
import { useDeoSchoolAdminsViewModel } from '@/lib/presentation/hooks/deo';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

function formatJoined(value: string | null): string | null {
  return value
    ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
    : null;
}

/** DEO School Admin Directory, ported from portal-web
 * app/government/deo/school-admins/page.tsx and read from this device.
 * Layout: docs/superpowers/specs/2026-11-14-deo-portal-web-design-reference.md §4.4. */
export function DeoSchoolAdminsPage() {
  const vm = useDeoSchoolAdminsViewModel();
  const state = useViewModel(vm.store, (s) => s.directory);
  const [activeTab, setActiveTab] = useState<AdminTab>('All');

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  if (data && data.districtId === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
          <p className="text-gray-600">No district assigned to your account.</p>
        </div>
      </div>
    );
  }

  const admins = data?.admins ?? [];
  const counts = adminTabCounts(admins);
  const filtered = filterAdminsByTab(admins, activeTab);
  const withoutAdmin = data?.schoolsWithoutAdmin ?? [];
  const place = [data?.district?.name, data?.county?.name].filter(Boolean).join(' · ');
  const now = new Date();

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
          <h1 className="text-xl font-bold text-white">School Admins</h1>
        </div>
        {place ? (
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-widest">District</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">{place}</p>
          </div>
        ) : null}
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <p className="text-3xl font-bold text-gray-900 mb-1">{counts.All}</p>
            <p className="text-sm font-medium text-gray-900">Total Admins</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-active mb-1">{counts.Active}</p>
            <p className="text-sm font-medium text-gray-900">Active</p>
          </Card>
          <Card>
            <p className="text-3xl font-bold text-pending mb-1">{counts.Suspended}</p>
            <p className="text-sm font-medium text-gray-900">Suspended</p>
          </Card>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">School Admin Directory</h2>
            <div className="flex gap-2">
              {ADMIN_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {state.status === 'error' ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">Failed to load school admins.</p>
              <button type="button" onClick={() => void vm.load()} className="mt-2 text-sm underline text-red-700">
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">No school admins found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((admin) => {
                const joined = formatJoined(admin.joinedAt);
                const idLine = [
                  admin.employeeNumber ? `ID: ${admin.employeeNumber}` : null,
                  joined ? `Joined: ${joined}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                const name = `${admin.firstName} ${admin.lastName}`;
                const hasIssues = admin.openInfrastructureIssues > 0;
                return (
                  <div
                    key={`${admin.userId}:${admin.schoolId}`}
                    data-admin
                    className="border border-gray-200 rounded-sm p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <Avatar
                          src={admin.photoUrl}
                          firstName={admin.firstName}
                          lastName={admin.lastName}
                          role="generic"
                          size="md"
                        />
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">{name}</h3>
                          <p className="text-sm text-gray-600">Principal · {admin.schoolName}</p>
                          {idLine ? <p className="text-xs text-gray-500 mt-1">{idLine}</p> : null}
                          <div className="flex flex-wrap gap-3 mt-3 text-xs">
                            <span className="flex items-center gap-1 text-active">
                              <span className="w-1.5 h-1.5 bg-active rounded-full" />
                              <span>Submitted {admin.reportsThisMonth} reports this month</span>
                            </span>
                            <span className={`flex items-center gap-1 ${hasIssues ? 'text-red-600' : 'text-active'}`}>
                              <span className={`w-1.5 h-1.5 ${hasIssues ? 'bg-red-500' : 'bg-active'} rounded-full`} />
                              <span>{admin.openInfrastructureIssues} open infrastructure issues</span>
                            </span>
                            <span className="flex items-center gap-1 text-active">
                              <span className="w-1.5 h-1.5 bg-active rounded-full" />
                              <span>Last active: {lastActiveLabel(admin.lastLoginAt, now)}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold ${
                            admin.isActive ? 'bg-active text-slate-100' : 'bg-error text-slate-100'
                          }`}
                        >
                          {admin.isActive ? <CheckCircle className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                          {admin.isActive ? 'Active' : 'Suspended'}
                        </span>
                        <Link
                          href={`/government/deo/messages?userId=${encodeURIComponent(admin.userId)}`}
                          aria-label={`Message ${name}`}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <MessageSquare className="w-5 h-5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {state.status !== 'error' && withoutAdmin.length > 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              No School Admin: {withoutAdmin.map((school) => school.name).join(', ')}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
