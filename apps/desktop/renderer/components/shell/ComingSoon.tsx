import { Construction } from 'lucide-react';
import { EmptyState } from '@nemis-desktop/ui';

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="p-8">
      <EmptyState
        icon={<Construction className="w-12 h-12" />}
        title={title}
        description="This page has not been migrated to the desktop client yet. It will follow the same Component → ViewModel → Presentation pattern as the Dashboard."
      />
    </div>
  );
}
