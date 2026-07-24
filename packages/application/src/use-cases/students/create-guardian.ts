import { Guardian, StudentGuardian } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CreateGuardianDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IGuardianRepository } from '../../interfaces/students/guardian-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export class CreateGuardianUseCase implements CommandHandler<
  CreateGuardianDto,
  ApplicationResponse<StudentOutput>
> {
  constructor(
    private readonly deps: {
      students: IStudentRepository;
      guardians: IGuardianRepository;
      unitOfWork: IUnitOfWork;
      clock: IClock;
      ids: IIdGenerator;
      logger: IAppLogger;
    },
  ) {}
  execute(command: CreateGuardianDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('CreateGuardian', this.deps.logger, async () => {
      const student = this.deps.students.findById(command.studentId);
      if (!student) throw new WorkflowException('Student does not exist.');
      const at = this.deps.clock.now();
      const guardian = Guardian.create({
        id: this.deps.ids.next(),
        firstName: command.firstName,
        lastName: command.lastName,
        relationship: command.relationship,
        phoneNumber: command.phoneNumber,
        occurredAt: at,
      });
      student.addGuardian(
        StudentGuardian.reconstitute({
          id: this.deps.ids.next(),
          guardianId: guardian.id,
          isPrimary: command.isPrimary,
        }),
        command.actorId ?? 'local-admin',
        at,
      );
      this.deps.unitOfWork.run(() => {
        this.deps.guardians.save(guardian);
        this.deps.students.save(student);
      });
      return ok(toStudentOutput(student));
    });
  }
}
