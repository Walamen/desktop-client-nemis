export interface AlertOfficer {
  readonly id: string;
  readonly name: string;
}

/** The DEO's local alert writes. Local only: the alerts table's outbox
 * trigger queues each change for the next sync. Every method is false when
 * nothing changed: unknown alert, not this district's, or a refused transition. */
export interface IDistrictAlertStore {
  /** Marks an unresolved alert of this district (tagged with it, or raised
   * against one of its schools) resolved. On an INFRASTRUCTURE_ISSUE it also
   * merges status RESOLVED and the resolver into the metadata, whatever the
   * issue's status (an escalated one included). */
  resolve(districtId: string, alertId: string, by: AlertOfficer, at: string): boolean;
  /** Infrastructure issue OPEN -> UNDER_REVIEW. */
  review(districtId: string, alertId: string, by: AlertOfficer, comments: string | null, at: string): boolean;
  /** Infrastructure issue OPEN or UNDER_REVIEW -> resolved. */
  resolveInfrastructure(districtId: string, alertId: string, by: AlertOfficer, comments: string | null, at: string): boolean;
  /** Infrastructure issue OPEN or UNDER_REVIEW, severity HIGH or CRITICAL -> ESCALATED; fills a null countyId from the district. */
  escalate(districtId: string, alertId: string, by: AlertOfficer, reason: string, at: string): boolean;
}
