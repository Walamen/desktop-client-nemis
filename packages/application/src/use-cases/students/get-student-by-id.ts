import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetStudentByIdDeps {
  students: IStudentRepository;
  logger: IAppLogger;
}

export class GetStudentByIdUseCase implements QueryHandler<
  { studentId: string },
  ApplicationResponse<StudentOutput | null>
> {
  constructor(private readonly deps: GetStudentByIdDeps) {}

  execute(query: { studentId: string }): Promise<ApplicationResponse<StudentOutput | null>> {
    return invokeUseCase('GetStudentById', this.deps.logger, async () => {
      const student = this.deps.students.findById(query.studentId);
      return ok(student ? toStudentOutput(student) : null);
    });
  }
}
