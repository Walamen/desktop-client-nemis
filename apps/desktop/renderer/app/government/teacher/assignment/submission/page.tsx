'use client';

import { Suspense } from 'react';
import { SubmissionDetailPage } from '@/components/assignment/SubmissionDetailPage';
import { useQueryParam } from '@/hooks/use-query-param';

function SubmissionRoute() {
  const assignmentId = useQueryParam('assignmentId');
  const studentId = useQueryParam('studentId');
  if (!assignmentId || !studentId) return null;
  // Keyed on both: a different assignment or student starts the page afresh.
  return <SubmissionDetailPage key={`${assignmentId}/${studentId}`} assignmentId={assignmentId} studentId={studentId} />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SubmissionRoute />
    </Suspense>
  );
}
