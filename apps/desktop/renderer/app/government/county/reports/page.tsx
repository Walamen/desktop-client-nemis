import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County reports" description="Reports submitted by schools in the authorized county." sections={[
    { collection: 'reports', label: 'Reports', columns: ['schoolId', 'title', 'type', 'status', 'submittedAt', 'reviewedAt'] },
  ]} />;
}
