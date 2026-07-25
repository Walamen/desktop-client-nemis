import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National alerts" description="Alerts across the authorized national dataset." sections={[
    { collection: 'alerts', label: 'Alerts', columns: ['countyId', 'districtId', 'institutionId', 'type', 'severity', 'title', 'isResolved'] },
  ]} />;
}
