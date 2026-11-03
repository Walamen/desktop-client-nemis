'use client';

import { Suspense } from 'react';
import { AssignmentForm } from '@/components/assignment/AssignmentForm';
import { useQueryParam } from '@/hooks/use-query-param';

function EditRoute() {
  const id = useQueryParam('id');
  if (!id) return null;
  // Keyed on the assignment: a different `?id=` re-seeds the form afresh.
  return <AssignmentForm key={id} mode="edit" assignmentId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EditRoute />
    </Suspense>
  );
}
