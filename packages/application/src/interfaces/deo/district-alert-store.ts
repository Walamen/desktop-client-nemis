/** The one write the DEO dashboard makes. Local only: the alerts table's
 * outbox trigger queues the change for the next sync. */
export interface IDistrictAlertStore {
  /** Marks an unresolved alert of this district (tagged with it, or raised
   * against one of its schools) resolved. False when nothing changed:
   * unknown alert, already resolved, or not this district's. */
  resolve(districtId: string, alertId: string, resolvedBy: string, at: string): boolean;
}
