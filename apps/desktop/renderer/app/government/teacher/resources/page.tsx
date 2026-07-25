import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="Class resources" description="Learning resources shared with your assigned classes." sections={[
    { collection: 'class_resources', label: 'Resources', columns: ['title', 'category', 'type', 'classId', 'subjectId', 'isVisible', 'updatedAt'] },
  ]} />;
}
