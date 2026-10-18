import type { CountyGuardianDetail, CountyGuardiansQuery, CountyGuardiansResult } from '@nemis-desktop/types';

/** County (CEO) Parents & Guardians pages, read from this device's synced database
 * (docs/superpowers/specs/2026-10-18-county-parents-design.md §5.2–5.6). */
export interface ICountyGuardiansReadModel {
  /** guardians.service findByCounty (filtered, paged) + getStatsByCounty. */
  listGuardians(query: CountyGuardiansQuery): Omit<CountyGuardiansResult, 'county' | 'districts'>;
  /** A guardian with at least one link to this county's students; else null. */
  getGuardian(id: string): CountyGuardianDetail | null;
}
