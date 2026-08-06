'use client';

import { useEffect, useState } from 'react';
import { SubmissionDetailPage } from '@/components/assignment/SubmissionDetailPage';
import { queryParam } from '@/components/teachers/shared';

export default function Page() {
  const [assignmentId, setAssignmentId] = useState('');
  const [studentId, setStudentId] = useState('');
  useEffect(() => {
    setAssignmentId(queryParam('assignmentId'));
    setStudentId(queryParam('studentId'));
  }, []);
  if (!assignmentId || !studentId) return null;
  return <SubmissionDetailPage assignmentId={assignmentId} studentId={studentId} />;
}
