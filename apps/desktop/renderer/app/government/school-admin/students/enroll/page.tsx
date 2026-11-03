import { Suspense } from 'react';
import { EnrollmentPage } from '@/components/students/EnrollmentPage';

// useSearchParams() in a statically exported route must sit under Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <EnrollmentPage />
    </Suspense>
  );
}
