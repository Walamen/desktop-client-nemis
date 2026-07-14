'use client';

import { useAppVersion } from '@/hooks/useAppVersion';

export default function HomePage() {
  const { version, error } = useAppVersion();

  return (
    <section className="max-w-xl rounded-card border border-slate-200 bg-white p-8">
      <h2 className="text-xl font-semibold text-primary">Welcome to NEMIS Desktop</h2>
      <p className="mt-2 text-sm text-slate-600">
        Offline-first desktop client for the Republic of Liberia&apos;s national education platform.
      </p>
      <dl className="mt-6 text-sm">
        <dt className="font-medium text-slate-500">Application version</dt>
        <dd className="mt-1 text-slate-900" data-testid="app-version">
          {error ? <span className="text-error">{error}</span> : (version ?? 'Loading…')}
        </dd>
      </dl>
    </section>
  );
}
