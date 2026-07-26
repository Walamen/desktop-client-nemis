import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County students" description="Students enrolled in institutions within this county." sections={[
    { collection: 'students', label: 'Students', columns: ['institutionId', 'firstName', 'lastName', 'admissionNumber', 'gradeLevel'] },
  ]} />;
}
