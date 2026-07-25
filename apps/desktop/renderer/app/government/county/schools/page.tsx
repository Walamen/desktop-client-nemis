import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County schools" description="Institutions authorized for this county workspace." sections={[
    { collection: 'institutions', label: 'Schools', columns: ['code', 'name', 'type', 'ownership', 'districtId', 'approvalStatus'] },
    { collection: 'students', label: 'Students', columns: ['institutionId', 'firstName', 'lastName', 'admissionNumber', 'gradeLevel'] },
    { collection: 'staff', label: 'Teachers', columns: ['institutionId', 'firstName', 'lastName', 'position', 'isActive'] },
  ]} />;
}
