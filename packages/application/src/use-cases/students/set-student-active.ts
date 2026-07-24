import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { SetStudentActiveDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export class SetStudentActiveUseCase implements CommandHandler<
  SetStudentActiveDto,
  ApplicationResponse<StudentOutput>
> {
  constructor(
    private readonly deps: {
      students: IStudentRepository;
      unitOfWork: IUnitOfWork;
      clock: IClock;
      logger: IAppLogger;
    },
  ) {}
  execute(command: SetStudentActiveDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('SetStudentActive', this.deps.logger, async () => {
      const student = this.deps.students.findById(command.studentId);
      if (!student) throw new WorkflowException('Student does not exist.');
      const at = this.deps.clock.now();
      const actor = command.actorId ?? 'local-admin';
      if (command.isActive) student.activate(actor, at);
      else student.deactivate(actor, at);
      this.deps.unitOfWork.run(() => this.deps.students.save(student));
      return ok(toStudentOutput(student));
    });
  }
}
