'use client';

import { Suspense } from 'react';
import { CountyMessagesPanel } from '@/components/county/messaging/CountyMessagesPanel';

/** Port of portal-web government/county/messages/page.tsx. */
export default function Page() {
  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white px-6 py-5 ">
        <h1 className="text-xl font-bold text-white">Messages</h1>
        <p className="text-body text-slate-300">Direct messages with DEOs and school administrators in your county.</p>
      </div>
      <Suspense>
        <CountyMessagesPanel />
      </Suspense>
    </div>
  );
}
