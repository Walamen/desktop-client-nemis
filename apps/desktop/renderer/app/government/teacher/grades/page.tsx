import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="My grades" description="Only grades for your assigned classes and subjects are stored in this workspace." sections={[
    { collection: 'grades', label: 'Grades', columns: ['studentId', 'subjectId', 'classId', 'marksObtained', 'maxMarks', 'letterGrade', 'status'] },
    { collection: 'grading_periods', label: 'Periods', columns: ['name', 'periodType', 'startDate', 'endDate', 'isActive'] },
  ]} />;
}
