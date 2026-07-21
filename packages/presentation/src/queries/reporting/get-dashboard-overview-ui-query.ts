import type {
  ApplicationResponse,
  DashboardOverviewOutput,
  ReportingApplicationService,
} from '@nemis-desktop/application';

export class GetDashboardOverviewUiQuery {
  constructor(private readonly reporting: ReportingApplicationService) {}

  execute(): Promise<ApplicationResponse<DashboardOverviewOutput>> {
    return this.reporting.getDashboardOverview();
  }
}
