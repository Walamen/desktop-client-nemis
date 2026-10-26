import { Suspense } from 'react';
import { CloseWorkflowPage } from '@/components/academic-year-close/CloseWorkflowPage';

// Static export: the year arrives as ?yearId=, read on the client.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CloseWorkflowPage />
    </Suspense>
  );
}
