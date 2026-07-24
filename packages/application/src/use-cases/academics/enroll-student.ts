import { Enrollment } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { EnrollStudentDto, EnrollmentOutput } from '../../dto/academics/academics-dto';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
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
  academicYears?: IAcademicYearRepository;
  terms?: ITermRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class EnrollStudentUseCase implements CommandHandler<
  EnrollStudentDto,
  ApplicationResponse<EnrollmentOutput>
> {
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
      const student = this.deps.students.findById(command.studentId);
      if (!student?.isActive) throw new WorkflowException('Archived students cannot be enrolled.');
      const year = this.deps.academicYears?.findById(command.academicYearId);
      if (this.deps.academicYears && (!year || !year.isCurrent || year.status !== 'ACTIVE')) throw new WorkflowException('Enrollment requires the current active academic year.');
      const term = this.deps.terms?.findById(command.termId);
      if (this.deps.terms && (!term || !year || term.academicYearId !== year.id)) throw new WorkflowException('The selected term does not belong to the academic year.');
      const clazz = this.deps.classes.findById(command.classId);
      if (!clazz || !clazz.isActive || (year && clazz.academicYearId !== year.id)) throw new WorkflowException('The selected class is not active in the academic year.');
      if (this.deps.enrollments.hasEnrollmentForPeriod(command.studentId, command.academicYearId, command.termId)) throw new WorkflowException('Student already has an enrollment for this academic year and term.');

      const occurredAt = this.deps.clock.now();
      const enrollment = Enrollment.create({
        id: this.deps.ids.next(),
        studentId: command.studentId,
        classId: command.classId,
        academicYearId: command.academicYearId,
        termId: command.termId,
        occurredAt,
        enrollmentDate: command.enrollmentDate,
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
