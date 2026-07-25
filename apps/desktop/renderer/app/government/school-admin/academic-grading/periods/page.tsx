import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Grading periods" description="Assessment periods configured for the institution." sections={[
    { collection: 'grading_periods', label: 'Periods', columns: ['name', 'code', 'periodType', 'sequence', 'maxMarks', 'passingMarks', 'startDate', 'endDate', 'isActive'] },
  ]} />;
}
