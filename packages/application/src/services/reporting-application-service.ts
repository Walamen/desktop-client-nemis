import type { ApplicationResponse } from '../core/response';
import type { DashboardOverviewOutput, StudentStatisticsOutput } from '../dto/reporting/reporting-dto';
import type { GetDashboardOverviewUseCase } from '../use-cases/reporting/get-dashboard-overview';
import type { GetStudentStatisticsUseCase } from '../use-cases/reporting/get-student-statistics';

export interface ReportingApplicationServiceDeps {
  getDashboardOverview: GetDashboardOverviewUseCase;
  getStudentStatistics: GetStudentStatisticsUseCase;
}

export class ReportingApplicationService {
  constructor(private readonly deps: ReportingApplicationServiceDeps) {}
  getDashboardOverview(): Promise<ApplicationResponse<DashboardOverviewOutput>> {
    return this.deps.getDashboardOverview.execute({});
  }
  getStudentStatistics(): Promise<ApplicationResponse<StudentStatisticsOutput>> {
    return this.deps.getStudentStatistics.execute({});
  }
}
