// TODO(county Messages port): honour ?institutionId= — preselect that school's School Admin (docs/superpowers/specs/2026-10-18-county-parents-design.md §5.5).
import { SchoolAdminCollectionPage } from '@/components/school-admin/SchoolAdminModulePages';
export default function Page() {
  return <SchoolAdminCollectionPage title="County messages" description="Message threads visible to this county workspace." sections={[
    { collection: 'messages', label: 'Messages', columns: ['conversationId', 'senderRole', 'content', 'isRead', 'createdAt'] },
  ]} />;
}
