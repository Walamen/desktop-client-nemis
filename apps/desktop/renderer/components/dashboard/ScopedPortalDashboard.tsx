'use client';

import { useState } from 'react';
import type { ProvisioningStatus } from '@nemis-desktop/types';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

export function ScopedPortalDashboard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const [status, setStatus] = useState<ProvisioningStatus | null>(null);
  useRevalidateOnSync(() => {
    void sharedBridge.getProvisioningStatus().then(setStatus);
  }, []);
  const user = status?.user;
  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-medium text-blue-700">Authorized offline workspace</p>
          <h2 className="mt-1 text-3xl font-bold text-slate-950">{title}</h2>
          <p className="mt-2 text-slate-600">{description}</p>
        </div>
        <section className="grid gap-4 md:grid-cols-3">
          <Info label="Signed in as" value={user ? `${user.firstName} ${user.lastName}` : 'Loading…'} />
          <Info label="Role" value={user?.role.replaceAll('_', ' ') ?? 'Loading…'} />
          <Info
            label="Offline scope"
            value={user ? `${user.scope.type}: ${user.scope.scopeId}` : 'Loading…'}
          />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-semibold text-slate-900">Workspace security</h3>
          <p className="mt-2 text-sm text-slate-600">
            This portal reads only the encrypted database assigned to this account, role, and
            authorization scope. Signing out closes the database before another account can sign in.
          </p>
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 break-words font-medium text-slate-900">{value}</p>
    </div>
  );
}
