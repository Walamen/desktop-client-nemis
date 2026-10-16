import type { ApplicationResponse } from '../core/response';
import type { CountyDashboardOutput } from '../dto/county/county-dashboard-dto';
import type { GetCountyDashboardUseCase } from '../use-cases/county/get-county-dashboard';

export interface CountyApplicationServiceDeps {
  getDashboard: GetCountyDashboardUseCase;
}

/** The County (CEO) portal's application service. */
export class CountyApplicationService {
  constructor(private readonly deps: CountyApplicationServiceDeps) {}
  getDashboard(): Promise<ApplicationResponse<CountyDashboardOutput>> {
    return this.deps.getDashboard.execute({});
  }
}
