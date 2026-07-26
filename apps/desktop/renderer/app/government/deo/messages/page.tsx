import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="District messages" description="Message threads visible to this district workspace." sections={[
    { collection: 'messages', label: 'Messages', columns: ['conversationId', 'senderRole', 'content', 'isRead', 'createdAt'] },
  ]} />;
}
