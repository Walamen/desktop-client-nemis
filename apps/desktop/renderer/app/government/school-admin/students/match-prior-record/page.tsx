import { Suspense } from 'react';
import { MatchPriorRecordPage } from '@/components/transfers/MatchPriorRecordPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <MatchPriorRecordPage />
    </Suspense>
  );
}
