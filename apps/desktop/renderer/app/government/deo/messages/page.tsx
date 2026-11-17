'use client';

import { Suspense } from 'react';
import { DeoMessagesPanel } from '@/components/deo/messaging/DeoMessagesPanel';

/** Port of portal-web government/deo/messages/page.tsx. */
export default function Page() {
  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">DEO Portal</p>
        <h1 className="text-xl font-bold text-white">Messages</h1>
      </div>
      <div className="px-6 py-6">
        <Suspense>
          <DeoMessagesPanel />
        </Suspense>
      </div>
    </div>
  );
}
