import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { EnrollmentOutput, MoveEnrollmentClassDto } from '../../dto/academics/academics-dto';
import { WorkflowException } from '../../exceptions';
import type { IAppLogger } from '../../interfaces/app-logger';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IClock } from '../../interfaces/clock';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import { toEnrollmentOutput } from '../../mappers/academics/enrollment-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { requireFields } from '../../validators/validate';

export interface MoveEnrollmentClassDeps {
  enrollments: IEnrollmentRepository;
  classes: IClassRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  logger: IAppLogger;
}

export class MoveEnrollmentClassUseCase implements CommandHandler<
  MoveEnrollmentClassDto,
  ApplicationResponse<EnrollmentOutput>
> {
  constructor(private readonly deps: MoveEnrollmentClassDeps) {}

  execute(command: MoveEnrollmentClassDto): Promise<ApplicationResponse<EnrollmentOutput>> {
    return invokeUseCase('MoveEnrollmentClass', this.deps.logger, async () => {
      requireFields(command, ['enrollmentId', 'targetClassId']);
      const enrollment = this.deps.enrollments.findById(command.enrollmentId);
      if (!enrollment) {
        throw new WorkflowException(`Enrollment ${command.enrollmentId} does not exist.`);
      }
      const targetClass = this.deps.classes.findById(command.targetClassId);
      if (!targetClass?.isActive) {
        throw new WorkflowException('The target class does not exist or is inactive.');
      }
      if (targetClass.academicYearId !== enrollment.academicYearId) {
        throw new WorkflowException(
          'Students can only move to another class in the same academic year.',
        );
      }
      const currentClass = this.deps.classes.findById(enrollment.classId);
      if (!currentClass || currentClass.gradeLevel !== targetClass.gradeLevel) {
        throw new WorkflowException(
          'Class transfers must remain within the student’s current grade.',
        );
      }
      if (targetClass.id === enrollment.classId) {
        throw new WorkflowException('The student is already assigned to that class.');
      }

      enrollment.moveToClass(
        targetClass.id,
        command.actorId ?? 'local-admin',
        this.deps.clock.now(),
      );
      this.deps.unitOfWork.run(() => this.deps.enrollments.save(enrollment));
      return ok(toEnrollmentOutput(enrollment));
    });
  }
}
