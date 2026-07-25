import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Messages" description="Conversations involving your teacher profile and assigned learners." sections={[
    { collection: 'conversations', label: 'Conversations', columns: ['studentId', 'subject', 'lastMessageAt'] },
    { collection: 'messages', label: 'Messages', columns: ['senderRole', 'content', 'isRead', 'createdAt'] },
    { collection: 'announcements', label: 'School announcements', columns: ['title', 'priority', 'publishedAt', 'expiresAt'] },
  ]} />;
}
