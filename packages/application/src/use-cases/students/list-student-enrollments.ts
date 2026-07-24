import { ok, type ApplicationResponse } from '../../core/response';
import type { EnrollmentOutput } from '../../dto/academics/academics-dto';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toEnrollmentOutput } from '../../mappers/academics/enrollment-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
export class ListStudentEnrollmentsUseCase {
  constructor(private readonly deps: { enrollments: IEnrollmentRepository; logger: IAppLogger }) {}
  execute(query: { studentId: string }): Promise<ApplicationResponse<EnrollmentOutput[]>> {
    return invokeUseCase('ListStudentEnrollments', this.deps.logger, async () =>
      ok(this.deps.enrollments.findByStudentId(query.studentId).map(toEnrollmentOutput)),
    );
  }
}
