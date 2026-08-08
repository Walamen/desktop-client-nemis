export interface DistrictRef {
  readonly id: string;
  readonly name: string;
  readonly countyId: string;
}

export interface IDistrictRepository {
  /** Every district present in this device's local database — read-only
   * reference data, synced alongside institutions (see
   * Nemis/apps/Server desktop-provisioning.service.ts). */
  findAll(): DistrictRef[];
}
