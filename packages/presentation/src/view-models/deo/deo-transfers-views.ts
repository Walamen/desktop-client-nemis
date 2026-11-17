export const TRANSFER_STATUS_TABS = ['All', 'Pending', 'Lapsed', 'Approved', 'Rejected', 'Cancelled'] as const;
export type TransferStatusTab = (typeof TRANSFER_STATUS_TABS)[number];
export const DIRECTION_TABS = ['All', 'Into district', 'Out of district', 'Within district'] as const;
export type DirectionTab = (typeof DIRECTION_TABS)[number];

interface TabbedTransfer {
  status: string;
  direction: string;
  lapsed: boolean;
}

const DIRECTION_LABEL: Record<string, Exclude<DirectionTab, 'All'>> = {
  INTO: 'Into district',
  OUT_OF: 'Out of district',
  WITHIN: 'Within district',
};

export function directionLabel(direction: string): string {
  return DIRECTION_LABEL[direction] ?? direction;
}

/** A lapsed request is its own tab: it stays PENDING but the child has not moved. */
function inStatusTab(transfer: TabbedTransfer, tab: TransferStatusTab): boolean {
  if (tab === 'All') return true;
  if (tab === 'Lapsed') return transfer.lapsed;
  if (transfer.lapsed) return false;
  return transfer.status === tab.toUpperCase();
}

function inDirectionTab(transfer: TabbedTransfer, tab: DirectionTab): boolean {
  return tab === 'All' || directionLabel(transfer.direction) === tab;
}

/** DEO Transfers filters. portal-web lib/deo-dashboard.ts keeps the same rules. */
export function filterTransfers<T extends TabbedTransfer>(
  transfers: readonly T[],
  status: TransferStatusTab,
  direction: DirectionTab,
): T[] {
  return transfers.filter((t) => inStatusTab(t, status) && inDirectionTab(t, direction));
}

/** Status tab counts within the chosen direction. */
export function transferTabCounts(
  transfers: readonly TabbedTransfer[],
  direction: DirectionTab,
): Record<TransferStatusTab, number> {
  const scoped = transfers.filter((t) => inDirectionTab(t, direction));
  return Object.fromEntries(
    TRANSFER_STATUS_TABS.map((tab) => [tab, scoped.filter((t) => inStatusTab(t, tab)).length]),
  ) as Record<TransferStatusTab, number>;
}

/** Whole calendar days (local) since a request was made: "today", "1 day", "N days". */
export function waitingLabel(createdAt: string, now: Date): string {
  const at = new Date(createdAt);
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.max(0, Math.round((day(now) - day(at)) / 86_400_000));
  if (days === 0) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}
