import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District schools" description="Institutions authorized for this district workspace." sections={[
    { collection: 'institutions', label: 'Schools', columns: ['code', 'name', 'type', 'ownership', 'approvalStatus'] },
    { collection: 'students', label: 'Students', columns: ['institutionId', 'firstName', 'lastName', 'admissionNumber', 'gradeLevel'] },
    { collection: 'staff', label: 'Teachers', columns: ['institutionId', 'firstName', 'lastName', 'position', 'isActive'] },
  ]} />;
}
