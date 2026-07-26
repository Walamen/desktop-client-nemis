import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { StudentStatisticsOutput } from '../../dto/reporting/reporting-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetStudentStatisticsDeps {
  students: IStudentRepository;
  clock: IClock;
  logger: IAppLogger;
}

const RECENT_ADMISSION_WINDOW_MONTHS = 3;

export class GetStudentStatisticsUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<StudentStatisticsOutput>
> {
  constructor(private readonly deps: GetStudentStatisticsDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<StudentStatisticsOutput>> {
    return invokeUseCase('GetStudentStatistics', this.deps.logger, async () => {
      const byGender = this.deps.students.countByGender();
      const totalStudents = byGender.reduce((sum, g) => sum + g.studentCount, 0);
      const maleStudents = byGender.find((g) => g.gender === 'MALE')?.studentCount ?? 0;
      const femaleStudents = byGender.find((g) => g.gender === 'FEMALE')?.studentCount ?? 0;
      const since = new Date(this.deps.clock.now());
      since.setMonth(since.getMonth() - RECENT_ADMISSION_WINDOW_MONTHS);
      const recentEnrollments = this.deps.students.countRecentAdmissions(since.toISOString().slice(0, 10));
      return ok({ totalStudents, maleStudents, femaleStudents, recentEnrollments });
    });
  }
}
