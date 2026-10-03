const STYLES = {
  amber: 'bg-amber-100 text-amber-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-gray-100 text-gray-700',
} as const;

function describe(status: string, lapsed: boolean, ours: boolean): { label: string; tone: keyof typeof STYLES } {
  if (lapsed) return { label: ours ? 'Lapsed — ready to complete' : 'Lapsed', tone: 'amber' };
  switch (status) {
    case 'APPROVED':
      return { label: 'Approved', tone: 'green' };
    case 'REJECTED':
      return { label: 'Rejected', tone: 'red' };
    case 'CANCELLED':
      return { label: 'Cancelled', tone: 'gray' };
    default:
      return { label: 'Pending', tone: 'amber' };
  }
}

export function TransferStatusChip({ status, lapsed, ours }: { status: string; lapsed: boolean; ours: boolean }) {
  const { label, tone } = describe(status, lapsed, ours);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[tone]}`}>
      {label}
    </span>
  );
}
