import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District transfers" description="Student transfers involving schools in this district." sections={[
    { collection: 'student_transfers', label: 'Transfers', columns: ['studentId', 'fromInstitutionId', 'toInstitutionId', 'status', 'reason', 'requestedDate'] },
  ]} />;
}
