import { Suspense } from 'react';
import { DistrictDetailsPage } from '@/components/county/districts/DistrictDetailsPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <DistrictDetailsPage />
    </Suspense>
  );
}
