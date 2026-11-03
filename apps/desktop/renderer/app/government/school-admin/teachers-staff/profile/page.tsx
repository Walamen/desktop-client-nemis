import { Suspense } from 'react';
import { TeacherProfilePage } from '@/components/teachers/TeacherProfilePage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TeacherProfilePage />
    </Suspense>
  );
}
