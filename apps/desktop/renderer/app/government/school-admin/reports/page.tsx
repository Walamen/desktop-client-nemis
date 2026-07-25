import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Reports" description="Draft, submitted, and reviewed school reports in the active workspace." sections={[
    { collection: 'reports', label: 'Reports', columns: ['title', 'type', 'status', 'submittedAt', 'reviewedAt', 'updatedAt'] },
  ]} />;
}
