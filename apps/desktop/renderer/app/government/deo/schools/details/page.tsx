import { Suspense } from 'react';
import { DeoSchoolDetailPage } from '@/components/deo/DeoSchoolDetailPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <DeoSchoolDetailPage />
    </Suspense>
  );
}
