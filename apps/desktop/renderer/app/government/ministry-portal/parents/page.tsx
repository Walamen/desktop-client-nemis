import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National parents/guardians" description="Guardians on record across the authorized national dataset." sections={[
    { collection: 'guardians', label: 'Guardians', columns: ['firstName', 'lastName', 'relationship', 'phoneNumber', 'email', 'isEmergencyContact'] },
  ]} />;
}
