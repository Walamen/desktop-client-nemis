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
import { ReturningStudentException, WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { assertEnrollmentTarget } from './enrollment-target';
import type { EnrollmentRegistered } from '../../events/academics';

/** Shown verbatim to the admin; identical to the server's refusal. */
export const RETURNING_STUDENT_REFUSAL =
  'This student was enrolled in an earlier year. Enrol them for this year through the student lookup.';

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
      const student = this.deps.students.findById(command.studentId);
      if (!student?.isActive) throw new WorkflowException('Archived students cannot be enrolled.');
      assertEnrollmentTarget(this.deps, command);
      if (this.deps.enrollments.hasEnrollmentForPeriod(command.studentId, command.academicYearId, command.termId)) throw new WorkflowException('Student already has an enrollment for this academic year and term.');

      // Re-enrolment into a new year is online only (the lookup): a child with
      // no enrolment in this year but one in another year is a returning student.
      const earlier = this.deps.enrollments.findByStudentId(command.studentId);
      if (
        earlier.length > 0 &&
        !earlier.some((e) => e.academicYearId === command.academicYearId)
      ) {
        throw new ReturningStudentException(RETURNING_STUDENT_REFUSAL);
      }

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
