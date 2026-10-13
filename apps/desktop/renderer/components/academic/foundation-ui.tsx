import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';

export const statusVariant = (status: string) =>
  status === 'ACTIVE' ? 'success' : status === 'CLOSED' ? 'warning' : 'neutral';

export function LoadState({
  state,
  emptyTitle,
  emptyDescription,
  action,
}: {
  state: { status: string; error?: { userMessage: string } };
  emptyTitle: string;
  emptyDescription: string;
  action?: ReactNode;
}) {
  if (state.status === 'loading' || state.status === 'idle') return <Skeleton className="h-52 w-full rounded-card" />;
  if (state.status === 'error') return <ErrorState message={state.error?.userMessage ?? 'Unable to load local data.'} />;
  if (state.status === 'empty') return <EmptyState title={emptyTitle} description={emptyDescription} action={action} />;
  return null;
}

export function FormField({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}
