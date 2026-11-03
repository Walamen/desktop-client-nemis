import { Suspense } from 'react';
import { ClassDetailPage } from '@/components/classes/ClassDetailPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ClassDetailPage />
    </Suspense>
  );
}
