import { Card } from '@nemis-desktop/ui';
import { DatabaseZap } from 'lucide-react';

export function DatabaseUnavailablePanel({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <div role="alert" className="flex flex-col items-center py-8 text-center">
        <DatabaseZap className="mb-3 h-10 w-10 text-error" />
        <h3 className="mb-1 text-base font-semibold text-neutral-dark">Local database unavailable</h3>
        <p className="mb-4 max-w-md text-sm text-gray-600">
          We couldn&apos;t read the local database. Restart the application; if the problem
          persists, contact support.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </Card>
  );
}
