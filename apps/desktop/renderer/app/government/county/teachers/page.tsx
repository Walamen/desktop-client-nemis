import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County teachers" description="Teaching and administrative staff within this county." sections={[
    { collection: 'staff', label: 'Staff', columns: ['institutionId', 'firstName', 'lastName', 'position', 'isActive'] },
  ]} />;
}
