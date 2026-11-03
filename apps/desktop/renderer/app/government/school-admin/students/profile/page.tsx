import { Suspense } from 'react';
import { StudentProfilePage } from '@/components/students/StudentProfilePage';

// useSearchParams() in a statically exported route must sit under Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <StudentProfilePage />
    </Suspense>
  );
}
