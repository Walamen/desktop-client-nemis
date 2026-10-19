import { Suspense } from 'react';
import { TeacherProfilePage } from '@/components/county/teachers/TeacherProfilePage';

// useSearchParams() in a statically exported route must sit under a Suspense
// boundary, or `next build` fails.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <TeacherProfilePage />
    </Suspense>
  );
}
