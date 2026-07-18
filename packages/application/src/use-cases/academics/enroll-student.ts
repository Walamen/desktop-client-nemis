import { Enrollment } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { EnrollStudentDto, EnrollmentOutput } from '../../dto/academics/academics-dto';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toEnrollmentOutput } from '../../mappers/academics/enrollment-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { EnrollmentRegistered } from '../../events/academics';

export interface EnrollStudentDeps {
  enrollments: IEnrollmentRepository;
  classes: IClassRepository;
  students: IStudentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class EnrollStudentUseCase
  implements CommandHandler<EnrollStudentDto, ApplicationResponse<EnrollmentOutput>>
{
  constructor(private readonly deps: EnrollStudentDeps) {}

  execute(command: EnrollStudentDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return invokeUseCase('EnrollStudent', this.deps.logger, async () => {
      requireFields(command, ['studentId', 'classId', 'academicYearId', 'termId']);
      if (!this.deps.students.exists(command.studentId)) {
        throw new WorkflowException(`Student ${command.studentId} does not exist.`);
      }
      if (!this.deps.classes.exists(command.classId)) {
        throw new WorkflowException(`Class ${command.classId} does not exist.`);
      }
      if (this.deps.enrollments.hasActiveEnrollment(command.studentId, command.classId)) {
        throw new WorkflowException('Student is already actively enrolled in this class.');
      }

      const occurredAt = this.deps.clock.now();
      const enrollment = Enrollment.create({
        id: this.deps.ids.next(),
        studentId: command.studentId,
        classId: command.classId,
        academicYearId: command.academicYearId,
        termId: command.termId,
        occurredAt,
      });
      this.deps.unitOfWork.run(() => this.deps.enrollments.save(enrollment));

      const event: EnrollmentRegistered = {
        name: 'EnrollmentRegistered',
        occurredAt,
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        classId: enrollment.classId,
      };
      this.deps.events.publish(event);

      return ok(toEnrollmentOutput(enrollment));
    });
  }
}
