import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { GetGradesByStudentDto, GradeOutput } from '../../dto/assessments/assessments-dto';
import type { IGradeRepository } from '../../interfaces/assessments/grade-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toGradeOutput } from '../../mappers/assessments/grade-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetGradesByStudentDeps {
  grades: IGradeRepository;
  logger: IAppLogger;
}

export class GetGradesByStudentUseCase
  implements QueryHandler<GetGradesByStudentDto, ApplicationResponse<GradeOutput[]>>
{
  constructor(private readonly deps: GetGradesByStudentDeps) {}

  execute(query: GetGradesByStudentDto): Promise<ApplicationResponse<GradeOutput[]>> {
    return invokeUseCase('GetGradesByStudent', this.deps.logger, async () => {
      return ok(this.deps.grades.findByStudentId(query.studentId).map(toGradeOutput));
    });
  }
}
