'use client';

import { useEffect, useState } from 'react';
import { AssignmentForm } from '@/components/assignment/AssignmentForm';
import { queryId } from '@/components/teachers/shared';

export default function Page() {
  const [id, setId] = useState('');
  useEffect(() => {
    setId(queryId());
  }, []);
  if (!id) return null;
  return <AssignmentForm mode="edit" assignmentId={id} />;
}
