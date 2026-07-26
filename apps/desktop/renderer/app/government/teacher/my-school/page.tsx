import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="My school" description="Your institution's profile, as included in this device's offline snapshot." sections={[
    { collection: 'institutions', label: 'School', columns: ['code', 'name', 'type', 'ownership', 'districtId', 'approvalStatus'] },
  ]} />;
}
