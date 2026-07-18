import { StudentGuardian } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { LinkGuardianDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IGuardianRepository } from '../../interfaces/students/guardian-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { StudentGuardianLinked } from '../../events/students';

export interface LinkGuardianDeps {
  students: IStudentRepository;
  guardians: IGuardianRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class LinkGuardianToStudentUseCase
  implements CommandHandler<LinkGuardianDto, ApplicationResponse<StudentOutput>>
{
  constructor(private readonly deps: LinkGuardianDeps) {}

  execute(command: LinkGuardianDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('LinkGuardianToStudent', this.deps.logger, async () => {
      const student = this.deps.students.findById(command.studentId);
      if (!student) {
        throw new WorkflowException(`Student ${command.studentId} does not exist.`);
      }
      if (!this.deps.guardians.exists(command.guardianId)) {
        throw new WorkflowException(`Guardian ${command.guardianId} does not exist.`);
      }

      const at = this.deps.clock.now();
      const link = StudentGuardian.reconstitute({
        id: this.deps.ids.next(),
        guardianId: command.guardianId,
        isPrimary: command.isPrimary,
      });
      student.addGuardian(link, command.actorId, at);
      this.deps.unitOfWork.run(() => this.deps.students.save(student));

      const event: StudentGuardianLinked = {
        name: 'StudentGuardianLinked',
        occurredAt: at,
        studentId: student.id,
        guardianId: command.guardianId,
        isPrimary: command.isPrimary,
      };
      this.deps.events.publish(event);

      return ok(toStudentOutput(student));
    });
  }
}
