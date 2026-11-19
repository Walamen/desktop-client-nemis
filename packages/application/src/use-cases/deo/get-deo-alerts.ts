import type { DeoAlertsQuery, DeoAlertsResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IAppLogger } from '../../interfaces/app-logger';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

const PAGE_SIZE = 15;

export interface GetDeoAlertsDeps {
  readModel: IDistrictOverviewReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  logger: IAppLogger;
}

/** The DEO Alerts page, from this device. The read model returns the rows
 * already filtered and in page order; this only pages them. */
export class GetDeoAlertsUseCase implements QueryHandler<
  DeoAlertsQuery,
  ApplicationResponse<DeoAlertsResult>
> {
  constructor(private readonly deps: GetDeoAlertsDeps) {}

  execute(query: DeoAlertsQuery): Promise<ApplicationResponse<DeoAlertsResult>> {
    return invokeUseCase('GetDeoAlerts', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) {
        return ok({
          districtId: null,
          district: null,
          county: null,
          alerts: [],
          meta: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 },
        });
      }
      const { readModel } = this.deps;
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;
      const rows = readModel.listDistrictAlerts(districtId, query.filter);
      const total = rows.length;
      const totalPages = Math.ceil(total / PAGE_SIZE);
      const requested = Number.isFinite(query.page) ? Math.floor(query.page) : 1;
      const page = totalPages === 0 ? 1 : Math.min(Math.max(requested, 1), totalPages);
      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        alerts: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        meta: { page, limit: PAGE_SIZE, total, totalPages },
      });
    });
  }
}
