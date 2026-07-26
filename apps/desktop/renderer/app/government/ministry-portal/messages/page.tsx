import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="National messages" description="Message threads visible to the ministry workspace." sections={[
    { collection: 'messages', label: 'Messages', columns: ['conversationId', 'senderRole', 'content', 'isRead', 'createdAt'] },
  ]} />;
}
