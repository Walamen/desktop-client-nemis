export const ADMIN_TABS = ['All', 'Active', 'Suspended'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

function inAdminTab(admin: { isActive: boolean }, tab: AdminTab): boolean {
  if (tab === 'Active') return admin.isActive;
  if (tab === 'Suspended') return !admin.isActive;
  return true;
}

/** School Admin Directory tabs: Suspended = the account is deactivated.
 * portal-web lib/deo-dashboard.ts keeps the same rules. */
export function filterAdminsByTab<T extends { isActive: boolean }>(admins: readonly T[], tab: AdminTab): T[] {
  return admins.filter((admin) => inAdminTab(admin, tab));
}

export function adminTabCounts(admins: readonly { isActive: boolean }[]): Record<AdminTab, number> {
  return Object.fromEntries(
    ADMIN_TABS.map((tab) => [tab, admins.filter((admin) => inAdminTab(admin, tab)).length]),
  ) as Record<AdminTab, number>;
}

/** "today", "yesterday", "N days ago" up to 30 days, then the date. Counts
 * whole calendar days in the device's local time. */
export function lastActiveLabel(lastLoginAt: string | null, now: Date): string {
  if (!lastLoginAt) return 'Never signed in';
  const at = new Date(lastLoginAt);
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 30) return `${days} days ago`;
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
