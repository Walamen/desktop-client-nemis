import { Suspense } from 'react';
import { ParentProfilePage } from '@/components/county/parents/ParentProfilePage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ParentProfilePage />
    </Suspense>
  );
}
