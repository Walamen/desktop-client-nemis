import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National schools" description="Institutions contained in the national offline snapshot." sections={[
    { collection: 'institutions', label: 'Schools', columns: ['code', 'name', 'type', 'ownership', 'countyId', 'districtId', 'approvalStatus'] },
  ]} />;
}
