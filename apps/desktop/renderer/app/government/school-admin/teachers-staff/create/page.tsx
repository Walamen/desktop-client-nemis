import { Suspense } from 'react';
import { TeacherFormPage } from '@/components/teachers/TeacherFormPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TeacherFormPage />
    </Suspense>
  );
}
