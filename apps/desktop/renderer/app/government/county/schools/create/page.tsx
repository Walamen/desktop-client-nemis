import { Suspense } from 'react';
import { CreateSchoolPage } from '@/components/county/schools/CreateSchoolPage';

// useSearchParams() (Fix and resend's ?registration=) in a statically
// exported route must sit under a Suspense boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CreateSchoolPage />
    </Suspense>
  );
}
