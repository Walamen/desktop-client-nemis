import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="My classes" description="Classes, subjects, and learners included by your current teaching assignments." sections={[
    { collection: 'classes', label: 'Classes', columns: ['name', 'section', 'gradeLevel', 'capacity', 'isActive'] },
    { collection: 'subjects', label: 'Subjects', columns: ['name', 'code', 'description', 'isActive'] },
    { collection: 'students', label: 'Learners', columns: ['firstName', 'lastName', 'admissionNumber', 'gradeLevel', 'isActive'] },
  ]} />;
}
