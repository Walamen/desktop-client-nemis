import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County alerts" description="Operational alerts from institutions within this county." sections={[
    { collection: 'alerts', label: 'Alerts', columns: ['institutionId', 'type', 'severity', 'title', 'isResolved', 'updatedAt'] },
  ]} />;
}
