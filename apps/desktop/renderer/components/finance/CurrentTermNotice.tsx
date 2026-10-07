import Link from 'next/link';

const BOX = 'rounded-card border border-pending/30 bg-pending/10 px-4 py-2.5 text-xs text-pending';

/** Why payment entry is disabled while the current term isn't usable.
 * Renders nothing once the term has loaded. */
export function CurrentTermNotice({ status, errorMessage }: { status: string; errorMessage?: string }) {
  if (status === 'success' || status === 'refreshing') return null;
  if (status === 'empty') {
    return (
      <div className={BOX}>
        No current term is set — payment entry is disabled.{' '}
        <Link href="/government/school-admin/terms" className="font-semibold underline">Set a current term</Link>
      </div>
    );
  }
  if (status === 'error') {
    return <div className={BOX}>{errorMessage ?? 'The current term could not be loaded.'} Payment entry is disabled.</div>;
  }
  return <div className={BOX}>Loading the current term — payment entry is disabled until it resolves.</div>;
}
