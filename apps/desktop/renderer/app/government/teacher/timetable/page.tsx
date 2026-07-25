import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="My timetable" description="Read-only schedule entries for your assigned teaching workload." sections={[
    { collection: 'timetable_entries', label: 'Schedule', columns: ['dayOfWeek', 'startTime', 'endTime', 'classId', 'subjectId', 'room', 'isBreak'] },
  ]} />;
}
