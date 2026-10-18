import type { CountyGuardianDetail, CountyGuardiansQuery, CountyGuardiansResult } from '@nemis-desktop/types';
import type { ICountyGuardiansReadModel } from '../../interfaces/county/county-guardians-read-model';

/** Settable canned page and details; records the last query. */
export class InMemoryCountyGuardiansReadModel implements ICountyGuardiansReadModel {
  page: Omit<CountyGuardiansResult, 'county' | 'districts'> = {
    stats: { total: 0, primaryGuardians: 0, childrenCovered: 0 },
    data: [],
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1,
  };
  guardianById = new Map<string, CountyGuardianDetail>();
  lastQuery: CountyGuardiansQuery | null = null;

  listGuardians(query: CountyGuardiansQuery): Omit<CountyGuardiansResult, 'county' | 'districts'> {
    this.lastQuery = query;
    return this.page;
  }

  getGuardian(id: string): CountyGuardianDetail | null {
    return this.guardianById.get(id) ?? null;
  }
}
