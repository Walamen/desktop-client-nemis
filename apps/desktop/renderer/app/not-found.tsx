import Link from 'next/link';
import { EmptyState, Button } from '@nemis-desktop/ui';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center h-screen bg-neutral-light">
      <EmptyState
        icon={<FileQuestion className="w-12 h-12" />}
        title="Page not found"
        description="The page you are looking for does not exist in the desktop client."
        action={
          <Link href="/government/school-admin">
            <Button variant="primary">Back to Dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}
