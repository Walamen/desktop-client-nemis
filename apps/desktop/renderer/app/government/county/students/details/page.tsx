import { Suspense } from 'react';
import { StudentDetailPage } from '@/components/county/students/StudentDetailPage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <StudentDetailPage />
    </Suspense>
  );
}
