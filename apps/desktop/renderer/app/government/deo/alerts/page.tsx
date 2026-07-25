import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District alerts" description="Alerts from schools in this district." sections={[
    { collection: 'alerts', label: 'Alerts', columns: ['institutionId', 'type', 'severity', 'title', 'isResolved', 'updatedAt'] },
  ]} />;
}
