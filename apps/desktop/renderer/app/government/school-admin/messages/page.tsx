import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';

export default function Page() {
  return <SchoolAdminCollectionPage title="Communications" description="School announcements and guardian-teacher conversations available offline." sections={[
    { collection: 'conversations', label: 'Conversations', columns: ['studentId', 'teacherId', 'subject', 'lastMessageAt'] },
    { collection: 'messages', label: 'Messages', columns: ['senderRole', 'content', 'isRead', 'createdAt'] },
    { collection: 'announcements', label: 'Announcements', columns: ['title', 'priority', 'targetAudience', 'publishedAt', 'expiresAt'] },
  ]} />;
}
