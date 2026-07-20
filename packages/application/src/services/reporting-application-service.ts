import type { ApplicationResponse } from '../core/response';
import type { DashboardOverviewOutput } from '../dto/reporting/reporting-dto';
import type { GetDashboardOverviewUseCase } from '../use-cases/reporting/get-dashboard-overview';

export interface ReportingApplicationServiceDeps {
  getDashboardOverview: GetDashboardOverviewUseCase;
}

export class ReportingApplicationService {
  constructor(private readonly deps: ReportingApplicationServiceDeps) {}
  getDashboardOverview(): Promise<ApplicationResponse<DashboardOverviewOutput>> {
    return this.deps.getDashboardOverview.execute({});
  }
}
