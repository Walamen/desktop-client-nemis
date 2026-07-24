import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { UpdateStudentDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export class UpdateStudentUseCase implements CommandHandler<
  UpdateStudentDto,
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
  execute(command: UpdateStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('UpdateStudent', this.deps.logger, async () => {
      const student = this.deps.students.findById(command.studentId);
      if (!student) throw new WorkflowException('Student does not exist.');
      student.updateProfile(command, command.actorId ?? 'local-admin', this.deps.clock.now());
      this.deps.unitOfWork.run(() => this.deps.students.save(student));
      return ok(toStudentOutput(student));
    });
  }
}
