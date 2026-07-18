import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { DeactivateStudentDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface DeactivateStudentDeps {
  students: IStudentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class DeactivateStudentUseCase
  implements CommandHandler<DeactivateStudentDto, ApplicationResponse<StudentOutput>>
{
  constructor(private readonly deps: DeactivateStudentDeps) {}

  execute(command: DeactivateStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('DeactivateStudent', this.deps.logger, async () => {
      const student = this.deps.students.findById(command.studentId);
      if (!student) {
        throw new WorkflowException(`Student ${command.studentId} does not exist.`);
      }
      student.deactivate(command.actorId, this.deps.clock.now());
      this.deps.unitOfWork.run(() => this.deps.students.save(student));
      return ok(toStudentOutput(student));
    });
  }
}
