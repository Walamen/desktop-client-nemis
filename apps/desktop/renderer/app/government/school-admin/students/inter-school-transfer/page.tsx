import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Inter-school transfers" description="Incoming and outgoing student transfer requests involving this institution." sections={[
    { collection: 'student_transfers', label: 'Transfers', columns: ['studentId', 'fromInstitutionId', 'toInstitutionId', 'status', 'reason', 'requestedDate', 'reviewedAt'] },
  ]} />;
}
