import { Suspense } from 'react';
import { ReviewTransferPage } from '@/components/transfers/ReviewTransferPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReviewTransferPage />
    </Suspense>
  );
}
