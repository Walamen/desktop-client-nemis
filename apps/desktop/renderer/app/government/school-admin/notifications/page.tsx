import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Notifications" description="Server-issued notifications for this signed-in administrator." sections={[
    { collection: 'user_notifications', label: 'Notifications', columns: ['type', 'title', 'message', 'isRead', 'createdAt'] },
  ]} />;
}
