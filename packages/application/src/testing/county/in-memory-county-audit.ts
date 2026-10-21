import type { CountyAuditPage, CountyAuditQuery, CountyAuditStats, CountySettings } from '@nemis-desktop/types';
import type { ICountyAuditReadModel, ICountySettingsReadModel } from '../../interfaces/county/county-audit-read-model';

export class InMemoryCountyAuditReadModel implements ICountyAuditReadModel {
  stats: CountyAuditStats = { total: 0, today: 0, week: 0, actions: [], entityTypes: [] };
  /** Returned for every list call unless a page-specific one is set. */
  page: CountyAuditPage | null = null;
  lastQuery: CountyAuditQuery | null = null;

  getStats(): CountyAuditStats {
    return this.stats;
  }

  list(query: CountyAuditQuery): CountyAuditPage {
    this.lastQuery = query;
    return this.page ?? { items: [], total: 0, page: query.page, limit: query.limit };
  }
}

export class InMemoryCountySettingsReadModel implements ICountySettingsReadModel {
  settings: CountySettings = { county: null, districtCount: 0, schoolCount: 0 };

  get(): CountySettings {
    return this.settings;
  }
}
