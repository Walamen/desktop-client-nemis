import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Academic & grading" description="Grade configuration, periods, and student results available in this offline workspace." sections={[
    { collection: 'grades', label: 'Grades', columns: ['studentId', 'subjectId', 'marksObtained', 'maxMarks', 'letterGrade', 'status'] },
    { collection: 'grading_periods', label: 'Grading periods', columns: ['name', 'code', 'periodType', 'startDate', 'endDate', 'isActive'] },
    { collection: 'institution_grading_configs', label: 'Configuration', columns: ['maxMarks', 'passingMarks', 'calculationMethod', 'periodsPerTerm', 'termsPerYear'] },
  ]} />;
}
