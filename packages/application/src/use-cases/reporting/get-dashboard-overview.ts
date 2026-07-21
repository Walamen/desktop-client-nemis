import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { DashboardOverviewOutput } from '../../dto/reporting/reporting-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { ISubjectRepository } from '../../interfaces/academics/subject-repository';
import type { IAttendanceRepository } from '../../interfaces/attendance/attendance-repository';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetDashboardOverviewDeps {
  students: IStudentRepository;
  classes: IClassRepository;
  subjects: ISubjectRepository;
  attendance: IAttendanceRepository;
  clock: IClock;
  logger: IAppLogger;
}

export class GetDashboardOverviewUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DashboardOverviewOutput>
> {
  constructor(private readonly deps: GetDashboardOverviewDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DashboardOverviewOutput>> {
    return invokeUseCase('GetDashboardOverview', this.deps.logger, async () => {
      const today = this.deps.clock.now().slice(0, 10);
      return ok({
        totalStudents: this.deps.students.countAll(),
        totalClasses: this.deps.classes.countAll(),
        totalSubjects: this.deps.subjects.countAll(),
        attendanceToday: this.deps.attendance.countByDate(today),
      });
    });
  }
}
