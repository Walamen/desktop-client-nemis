import { Suspense } from 'react';
import { StudentFormPage } from '@/components/students/StudentFormPage';

// The wizard reads ?nemisId=&dob= via useSearchParams, which needs a Suspense
// boundary in a statically exported route.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <StudentFormPage />
    </Suspense>
  );
}
