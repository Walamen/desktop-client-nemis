import { Enrollment, Guardian, Student, StudentGuardian } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CreateAndEnrollStudentDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IGuardianRepository } from '../../interfaces/students/guardian-repository';
import type { IEnrollmentRepository } from '../../interfaces/academics/enrollment-repository';
import type { IClassRepository } from '../../interfaces/academics/class-repository';
import type { IAcademicYearRepository } from '../../interfaces/academics/academic-year-repository';
import type { ITermRepository } from '../../interfaces/academics/term-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import { WorkflowException } from '../../exceptions';
import { assertEnrollmentTarget } from '../academics/enrollment-target';
import { mintUniqueNemisId } from './create-student';
import type { StudentRegistered } from '../../events/students';

export interface CreateAndEnrollStudentDeps {
  students: IStudentRepository;
  guardians: IGuardianRepository;
  enrollments: IEnrollmentRepository;
  classes: IClassRepository;
  academicYears: IAcademicYearRepository;
  terms: ITermRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

/** Adds a student and enrols them in one SQLite transaction (NEMIS ID desktop
 * parity spec 7.3), so a crash can never leave a student with no enrolment -
 * a child with no enrolment can never be given an end-of-year outcome. Write
 * order is guardians, then student (+ links), then enrolment; the outbox's seq
 * column pushes them in that order. */
export class CreateAndEnrollStudentUseCase implements CommandHandler<
  CreateAndEnrollStudentDto,
  ApplicationResponse<StudentOutput>
> {
  constructor(private readonly deps: CreateAndEnrollStudentDeps) {}

  execute(command: CreateAndEnrollStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('CreateAndEnrollStudent', this.deps.logger, async () => {
      requireFields(command, [
        'institutionId',
        'firstName',
        'lastName',
        'dateOfBirth',
        'gender',
        'gradeLevel',
        'academicYearId',
        'termId',
        'classId',
      ]);
      assertEnrollmentTarget(this.deps, command);

      const keptGuardians = command.guardians.filter(
        (g) => g.firstName.trim() && g.lastName.trim() && g.phoneNumber.trim(),
      );
      // The server creates a parent login for each guardian's email before the
      // student's own login, so a shared email would get the student rejected
      // (and its links and enrolment with it). Refuse it before writing.
      const studentEmail = command.email?.trim().toLowerCase();
      if (studentEmail && keptGuardians.some((g) => g.email?.trim().toLowerCase() === studentEmail)) {
        throw new WorkflowException(
          "The student's email can't be the same as a guardian's email. Leave the student's email blank or use a different one.",
        );
      }

      const occurredAt = this.deps.clock.now();
      const actor = command.actorId ?? 'local-admin';
      const nemisId = mintUniqueNemisId(this.deps.students);
      const student = Student.create({
        id: this.deps.ids.next(),
        institutionId: command.institutionId,
        firstName: command.firstName,
        middleName: command.middleName,
        lastName: command.lastName,
        nemisId,
        dateOfBirth: command.dateOfBirth,
        gender: command.gender,
        gradeLevel: command.gradeLevel,
        admissionDate: occurredAt.slice(0, 10),
        phoneNumber: command.phoneNumber,
        email: command.email,
        address: command.address,
        assertedNoNemisId: command.assertedNoNemisId,
        occurredAt,
      });

      const guardians = keptGuardians
        .map((g) => {
          const guardian = Guardian.create({
            id: this.deps.ids.next(),
            firstName: g.firstName,
            lastName: g.lastName,
            relationship: g.relationship,
            phoneNumber: g.phoneNumber,
            email: g.email?.trim() || undefined,
            occurredAt,
          });
          student.addGuardian(
            StudentGuardian.reconstitute({
              id: this.deps.ids.next(),
              guardianId: guardian.id,
              isPrimary: g.isPrimary,
            }),
            actor,
            occurredAt,
          );
          return guardian;
        });

      const enrollment = Enrollment.create({
        id: this.deps.ids.next(),
        studentId: student.id,
        classId: command.classId,
        academicYearId: command.academicYearId,
        termId: command.termId,
        occurredAt,
        enrollmentDate: command.enrollmentDate,
      });

      this.deps.unitOfWork.run(() => {
        for (const guardian of guardians) this.deps.guardians.save(guardian);
        this.deps.students.save(student);
        this.deps.enrollments.save(enrollment);
      });

      const event: StudentRegistered = {
        name: 'StudentRegistered',
        occurredAt,
        studentId: student.id,
        institutionId: student.institutionId,
        nemisId,
      };
      this.deps.events.publish(event);
      return ok(toStudentOutput(student));
    });
  }
}
