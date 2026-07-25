import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Infrastructure & alerts" description="Institution alerts and infrastructure-related issues synchronized to this workspace." sections={[
    { collection: 'alerts', label: 'Alerts', columns: ['type', 'severity', 'title', 'description', 'isResolved', 'updatedAt'] },
  ]} />;
}
