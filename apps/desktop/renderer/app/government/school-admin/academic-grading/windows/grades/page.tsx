import { Suspense } from 'react';
import { WindowGradesPage } from '@/components/academic-grading/WindowGradesPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <WindowGradesPage />
    </Suspense>
  );
}
