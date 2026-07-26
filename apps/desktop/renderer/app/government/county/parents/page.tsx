import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County parents/guardians" description="Guardians on record for students within this county." sections={[
    { collection: 'guardians', label: 'Guardians', columns: ['firstName', 'lastName', 'relationship', 'phoneNumber', 'email', 'isEmergencyContact'] },
  ]} />;
}
