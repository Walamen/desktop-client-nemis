import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National teachers" description="Teaching and administrative staff across the authorized national dataset." sections={[
    { collection: 'staff', label: 'Staff', columns: ['institutionId', 'firstName', 'lastName', 'position', 'isActive'] },
  ]} />;
}
