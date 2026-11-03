'use client';

import { Suspense } from 'react';
import { AssignmentDetailPage } from '@/components/assignment/AssignmentDetailPage';
import { useQueryParam } from '@/hooks/use-query-param';

function DetailRoute() {
  const id = useQueryParam('id');
  if (!id) return null;
  // Keyed on the assignment: a different `?id=` starts the page afresh.
  return <AssignmentDetailPage key={id} assignmentId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DetailRoute />
    </Suspense>
  );
}
