import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National notifications" description="Notifications addressed to the ministry workspace." sections={[
    { collection: 'user_notifications', label: 'Notifications', columns: ['type', 'title', 'message', 'isRead', 'createdAt'] },
  ]} />;
}
