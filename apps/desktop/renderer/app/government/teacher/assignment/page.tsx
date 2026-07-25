import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="Assignments" description="Assignments and learner submissions for your assigned classes." sections={[
    { collection: 'assignments', label: 'Assignments', columns: ['title', 'type', 'status', 'classId', 'subjectId', 'dueDate', 'totalMarks'] },
    { collection: 'assignment_submissions', label: 'Submissions', columns: ['assignmentId', 'studentId', 'status', 'submittedAt', 'grade', 'feedback'] },
  ]} />;
}
