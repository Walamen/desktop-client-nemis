import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County notifications" description="Notifications addressed to this county workspace." sections={[
    { collection: 'user_notifications', label: 'Notifications', columns: ['type', 'title', 'message', 'isRead', 'createdAt'] },
  ]} />;
}
