'use client';

import { useEffect, useState } from 'react';
import { AssignmentDetailPage } from '@/components/assignment/AssignmentDetailPage';
import { queryId } from '@/components/teachers/shared';

export default function Page() {
  const [id, setId] = useState('');
  useEffect(() => {
    setId(queryId());
  }, []);
  if (!id) return null;
  return <AssignmentDetailPage assignmentId={id} />;
}
