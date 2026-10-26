import { Suspense } from 'react';
import { CorrectionsPage } from '@/components/academic-year-close/CorrectionsPage';

// Static export: the year arrives as ?yearId=, read on the client.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CorrectionsPage />
    </Suspense>
  );
}
