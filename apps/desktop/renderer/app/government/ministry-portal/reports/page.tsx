import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National reports" description="Reports available to the ministry workspace." sections={[
    { collection: 'reports', label: 'Reports', columns: ['schoolId', 'districtId', 'countyId', 'title', 'type', 'status', 'submittedAt'] },
  ]} />;
}
