import { Suspense } from 'react';
import { AcademicGradingPage } from '@/components/academic-grading/AcademicGradingPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AcademicGradingPage />
    </Suspense>
  );
}
