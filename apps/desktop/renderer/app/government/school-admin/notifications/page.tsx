import { ComingSoon } from '@/components/shell/ComingSoon';
import { resolvePageTitle } from '@/components/shell/page-titles';

export default function Page() {
  return <ComingSoon title={resolvePageTitle('/government/school-admin/notifications').title} />;
}
