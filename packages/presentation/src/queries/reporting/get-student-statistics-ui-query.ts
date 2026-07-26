import type {
  ApplicationResponse,
  ReportingApplicationService,
  StudentStatisticsOutput,
} from '@nemis-desktop/application';

export class GetStudentStatisticsUiQuery {
  constructor(private readonly reporting: ReportingApplicationService) {}

  execute(): Promise<ApplicationResponse<StudentStatisticsOutput>> {
    return this.reporting.getStudentStatistics();
  }
}
