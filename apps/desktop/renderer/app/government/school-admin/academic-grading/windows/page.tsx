import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Grade entry windows" description="Open, closed, and published grading windows downloaded for this institution." sections={[
    { collection: 'grade_entry_windows', label: 'Windows', columns: ['name', 'status', 'openDate', 'closeDate', 'allowedRoles'] },
    { collection: 'grade_entry_window_classes', label: 'Assigned classes', columns: ['windowId', 'classId', 'status', 'openedAt', 'closedAt'] },
  ]} />;
}
