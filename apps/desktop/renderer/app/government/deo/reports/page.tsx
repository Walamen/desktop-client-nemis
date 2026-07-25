import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District reports" description="School reports available in this district scope." sections={[
    { collection: 'reports', label: 'Reports', columns: ['schoolId', 'title', 'type', 'status', 'submittedAt', 'reviewedAt'] },
  ]} />;
}
