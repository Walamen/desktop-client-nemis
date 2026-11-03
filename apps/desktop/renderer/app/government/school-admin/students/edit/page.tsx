import { Suspense } from 'react';
import { StudentFormPage } from '@/components/students/StudentFormPage';

// useSearchParams() in a statically exported route must sit under Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <StudentFormPage edit />
    </Suspense>
  );
}
