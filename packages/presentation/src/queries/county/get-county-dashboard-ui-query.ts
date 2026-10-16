import type {
  ApplicationResponse,
  CountyApplicationService,
  CountyDashboardOutput,
} from '@nemis-desktop/application';

export class GetCountyDashboardUiQuery {
  constructor(private readonly county: CountyApplicationService) {}

  execute(): Promise<ApplicationResponse<CountyDashboardOutput>> {
    return this.county.getDashboard();
  }
}
