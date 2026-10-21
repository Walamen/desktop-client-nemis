import type { CountyAuditPage, CountyAuditQuery, CountyAuditStats, CountySettings } from '@nemis-desktop/types';

/** County Audit Trail, read from this device's synced audit rows (last 12
 * months; docs/superpowers/specs/2026-10-21-county-audit-settings-design.md). */
export interface ICountyAuditReadModel {
  getStats(): CountyAuditStats;
  /** Newest first; search, action and entityType already normalised. */
  list(query: CountyAuditQuery): CountyAuditPage;
}

/** County Settings: the synced county row and its counts. */
export interface ICountySettingsReadModel {
  get(): CountySettings;
}
