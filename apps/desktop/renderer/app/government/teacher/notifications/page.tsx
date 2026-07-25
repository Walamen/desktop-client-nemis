import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Notifications" description="Notifications issued to your NEMIS account." sections={[
    { collection: 'user_notifications', label: 'Notifications', columns: ['type', 'title', 'message', 'isRead', 'createdAt'] },
  ]} />;
}
