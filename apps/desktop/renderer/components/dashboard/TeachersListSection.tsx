import { Card, EmptyState } from '@nemis-desktop/ui';
import { Users } from 'lucide-react';

export default function TeachersListSection() {
  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-dark flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Teaching Staff
        </h2>
        <p className="text-sm text-gray-600 mt-1">Teacher management arrives in a later phase</p>
      </div>
      <EmptyState icon={<Users className="w-12 h-12" />} title="Teacher directory not available yet" description="Staff records will appear here once teacher management is migrated." />
    </Card>
  );
}
