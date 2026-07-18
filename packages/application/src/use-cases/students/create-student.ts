import { Student } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CreateStudentDto, StudentOutput } from '../../dto/students/student-dto';
import type { IStudentRepository } from '../../interfaces/students/student-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toStudentOutput } from '../../mappers/students/student-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { StudentRegistered } from '../../events/students';

export interface CreateStudentDeps {
  students: IStudentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class CreateStudentUseCase implements CommandHandler<
  CreateStudentDto,
  ApplicationResponse<StudentOutput>
> {
  constructor(private readonly deps: CreateStudentDeps) {}

  execute(command: CreateStudentDto): Promise<ApplicationResponse<StudentOutput>> {
    return invokeUseCase('CreateStudent', this.deps.logger, async () => {
      requireFields(command, [
        'institutionId',
        'firstName',
        'lastName',
        'admissionNumber',
        'dateOfBirth',
        'gender',
      ]);

      if (
        this.deps.students.existsByAdmissionNumber(command.institutionId, command.admissionNumber)
      ) {
        throw new WorkflowException(
          `Admission number ${command.admissionNumber} already exists in this institution.`,
        );
      }

      const occurredAt = this.deps.clock.now();
      const student = Student.create({
        id: this.deps.ids.next(),
        institutionId: command.institutionId,
        firstName: command.firstName,
        middleName: command.middleName,
        lastName: command.lastName,
        admissionNumber: command.admissionNumber,
        dateOfBirth: command.dateOfBirth,
        gender: command.gender,
        gradeLevel: command.gradeLevel,
        occurredAt,
      });

      this.deps.unitOfWork.run(() => this.deps.students.save(student));

      const event: StudentRegistered = {
        name: 'StudentRegistered',
        occurredAt,
        studentId: student.id,
        institutionId: student.institutionId,
        admissionNumber: student.admissionNumber.value,
      };
      this.deps.events.publish(event);

      return ok(toStudentOutput(student));
    });
  }
}
