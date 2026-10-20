import type {
  CountyEnrollmentReport,
  CountyEnrollmentReportQuery,
  CountyReportOptions,
  CountyReportSchool,
} from '@nemis-desktop/types';
import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { ICountyAnalyticsReadModel } from '../../interfaces/county/county-analytics-read-model';
import type { ICountyReportsReadModel } from '../../interfaces/county/county-reports-read-model';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCountyReportOptionsDeps {
  readModel: ICountyReportsReadModel;
  countyReadModel: ICountyAnalyticsReadModel;
  logger: IAppLogger;
}

export interface GetCountyReportSchoolsDeps {
  readModel: ICountyReportsReadModel;
  logger: IAppLogger;
}

export interface GetCountyEnrollmentReportDeps extends GetCountyReportOptionsDeps {
  clock: IClock;
}

/** Generate Reports header and District filter. */
export class GetCountyReportOptionsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<CountyReportOptions>
> {
  constructor(private readonly deps: GetCountyReportOptionsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<CountyReportOptions>> {
    return invokeUseCase('GetCountyReportOptions', this.deps.logger, async () => {
      const { countyCode, districts } = this.deps.readModel.getOptions();
      const county = this.deps.countyReadModel.getCounty();
      return ok({ county: county ? { ...county, code: countyCode } : null, districts });
    });
  }
}

/** The School filter for one district. */
export class GetCountyReportSchoolsUseCase implements QueryHandler<
  { districtId: string },
  ApplicationResponse<CountyReportSchool[]>
> {
  constructor(private readonly deps: GetCountyReportSchoolsDeps) {}

  execute(query: { districtId: string }): Promise<ApplicationResponse<CountyReportSchool[]>> {
    return invokeUseCase('GetCountyReportSchools', this.deps.logger, async () =>
      ok(this.deps.readModel.listSchools(query.districtId)),
    );
  }
}

/** Enrollment report, county-wide or for one district; stamped with the clock. */
export class GetCountyEnrollmentReportUseCase implements QueryHandler<
  CountyEnrollmentReportQuery,
  ApplicationResponse<CountyEnrollmentReport>
> {
  constructor(private readonly deps: GetCountyEnrollmentReportDeps) {}

  execute(query: CountyEnrollmentReportQuery): Promise<ApplicationResponse<CountyEnrollmentReport>> {
    return invokeUseCase('GetCountyEnrollmentReport', this.deps.logger, async () => {
      const generatedAt = this.deps.clock.now();
      const { scopeName, ...report } = this.deps.readModel.getEnrollmentReport(query, generatedAt);
      const county = this.deps.countyReadModel.getCounty();
      const district = query.districtId
        ? { id: query.districtId, name: scopeName ?? 'Unknown District' }
        : { id: county?.id ?? '', name: county?.name ?? '' };
      return ok({ ...report, generatedAt, district });
    });
  }
}
