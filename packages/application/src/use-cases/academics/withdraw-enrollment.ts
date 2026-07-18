import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { WithdrawEnrollmentDto, EnrollmentOutput } from '../../dto/academics/academics-dto';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toEnrollmentOutput } from '../../mappers/academics/enrollment-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface WithdrawEnrollmentDeps {
  enrollments: IEnrollmentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class WithdrawEnrollmentUseCase
  implements CommandHandler<WithdrawEnrollmentDto, ApplicationResponse<EnrollmentOutput>>
{
  constructor(private readonly deps: WithdrawEnrollmentDeps) {}

  execute(command: WithdrawEnrollmentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return invokeUseCase('WithdrawEnrollment', this.deps.logger, async () => {
      const enrollment = this.deps.enrollments.findById(command.enrollmentId);
      if (!enrollment) {
        throw new WorkflowException(`Enrollment ${command.enrollmentId} does not exist.`);
      }
      enrollment.withdraw(command.actorId, this.deps.clock.now());
      this.deps.unitOfWork.run(() => this.deps.enrollments.save(enrollment));
      return ok(toEnrollmentOutput(enrollment));
    });
  }
}
