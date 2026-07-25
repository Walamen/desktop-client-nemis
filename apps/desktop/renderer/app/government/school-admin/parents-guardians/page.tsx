import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Parents & guardians" description="Guardian contact records downloaded for students in this institution. Add or edit guardians from a student's profile." sections={[
    { collection: 'guardians', label: 'Guardians', columns: ['firstName', 'lastName', 'relationship', 'phoneNumber', 'updatedAt'] },
    { collection: 'student_guardians', label: 'Student links', columns: ['studentId', 'guardianId', 'isPrimary', 'createdAt'] },
  ]} />;
}
