import type { DeoReportScope } from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import { WorkflowException } from '../../exceptions';
import type { IDistrictOverviewReadModel } from '../../interfaces/deo/district-overview-read-model';
import type { ICountyReportsReadModel } from '../../interfaces/county/county-reports-read-model';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetDeoReportScopeDeps {
  districtOverview: IDistrictOverviewReadModel;
  reports: ICountyReportsReadModel;
  /** The signed-in officer's district; null when none is assigned. */
  currentDistrictId: string | null;
  logger: IAppLogger;
}

/** DEO Generate Reports header and School filter: the officer's district,
 * its county (with the code the export letterhead prints), and the district's
 * active schools. */
export class GetDeoReportScopeUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeoReportScope>
> {
  constructor(private readonly deps: GetDeoReportScopeDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeoReportScope>> {
    return invokeUseCase('GetDeoReportScope', this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) return ok({ districtId: null, district: null, county: null, schools: [] });
      const district = this.deps.districtOverview.getDistrict(districtId);
      const county = district ? this.deps.districtOverview.getCounty(district.countyId) : null;
      return ok({
        districtId,
        district: district ? { id: district.id, name: district.name } : null,
        county: county ? { ...county, code: this.deps.reports.getOptions().countyCode } : null,
        schools: this.deps.reports.listSchools(districtId, { districtOnly: true }),
      });
    });
  }
}

export interface DeoReportDeps<Q, R> {
  /** Use-case name for the logs. */
  name: string;
  reports: ICountyReportsReadModel;
  /** The County report use case: the same rules, here pinned to one district. */
  inner: QueryHandler<Q & { districtId: string; districtOnly: true }, ApplicationResponse<R>>;
  currentDistrictId: string | null;
  logger: IAppLogger;
}

/** One DEO report. The district always comes from the session, never the
 * renderer, and a School filter must name one of the district's schools.
 * Rules: docs/superpowers/specs/2026-11-17-deo-generate-reports-design.md. */
export class DeoReportUseCase<Q extends { schoolId?: string }, R>
  implements QueryHandler<Q, ApplicationResponse<R>>
{
  constructor(private readonly deps: DeoReportDeps<Q, R>) {}

  execute(query: Q): Promise<ApplicationResponse<R>> {
    return invokeUseCase(this.deps.name, this.deps.logger, async () => {
      const districtId = this.deps.currentDistrictId;
      if (!districtId) throw new WorkflowException('No district is assigned to this workspace.');
      const schools = this.deps.reports.listSchools(districtId, { districtOnly: true });
      if (query.schoolId && !schools.some((school) => school.id === query.schoolId)) {
        throw new WorkflowException('That school is not in your district.');
      }
      // districtOnly: scope as the server's district generators do (no county filter).
      return this.deps.inner.execute({ ...query, districtId, districtOnly: true });
    });
  }
}
