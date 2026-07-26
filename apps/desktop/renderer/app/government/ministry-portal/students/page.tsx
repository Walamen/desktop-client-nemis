import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National students" description="Students enrolled across the authorized national dataset." sections={[
    { collection: 'students', label: 'Students', columns: ['institutionId', 'firstName', 'lastName', 'admissionNumber', 'gradeLevel'] },
  ]} />;
}
