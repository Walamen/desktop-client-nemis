import type { DeoInfrastructureResult } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { IAppLogger } from '../../interfaces/app-logger';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { infrastructureSummary, mapInfrastructureIssue, sortInfrastructureIssues } from './infrastructure-issues';

export interface GetDeoInfrastructureDeps {
  readModel: IDistrictOverviewReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  logger: IAppLogger;
}

/** The DEO Infrastructure page, from this device. The read model already
 * keeps only live infrastructure alerts; this maps them to the page's rows. */
export class GetDeoInfrastructureUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeoInfrastructureResult>
> {
  constructor(private readonly deps: GetDeoInfrastructureDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoInfrastructureResult>> {
    return invokeUseCase('GetDeoInfrastructure', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) {
        return ok({
          districtId: null,
          district: null,
          county: null,
          summary: { totalIssues: 0, critical: 0, open: 0, escalated: 0 },
          issues: [],
        });
      }
      const { readModel } = this.deps;
      const district = readModel.getDistrict(districtId);
      const county = district ? readModel.getCounty(district.countyId) : null;
      const issues = sortInfrastructureIssues(
        readModel
          .listInfrastructureIssues(districtId)
          .map((row) => mapInfrastructureIssue(row, district?.name ?? '')),
      );
      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county,
        summary: infrastructureSummary(issues),
        issues,
      });
    });
  }
}
