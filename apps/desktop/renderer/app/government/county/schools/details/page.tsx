import { Suspense } from 'react';
import { SchoolDetailPage } from '@/components/county/schools/SchoolDetailPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SchoolDetailPage />
    </Suspense>
  );
}
