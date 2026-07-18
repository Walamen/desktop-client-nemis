import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { GetClassRosterDto, ClassRosterOutput } from '../../dto/academics/academics-dto';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toEnrollmentOutput } from '../../mappers/academics/enrollment-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetClassRosterDeps {
  enrollments: IEnrollmentRepository;
  logger: IAppLogger;
}

export class GetClassRosterUseCase
  implements QueryHandler<GetClassRosterDto, ApplicationResponse<ClassRosterOutput>>
{
  constructor(private readonly deps: GetClassRosterDeps) {}

  execute(query: GetClassRosterDto): Promise<ApplicationResponse<ClassRosterOutput>> {
    return invokeUseCase('GetClassRoster', this.deps.logger, async () => {
      const enrollments = this.deps.enrollments
        .findByClassId(query.classId)
        .map(toEnrollmentOutput);
      return ok({ classId: query.classId, enrollments });
    });
  }
}
