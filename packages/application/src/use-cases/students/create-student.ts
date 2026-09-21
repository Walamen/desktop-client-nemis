import { Student } from '@nemis-desktop/domain';
import { generateNemisId } from '@nemis-desktop/shared';
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
        'dateOfBirth',
        'gender',
      ]);

      // Minted locally so a school with no connectivity can still enrol. The
      // server is the uniqueness authority and reassigns on the rare national
      // collision, returning the replacement in the sync receipt.
      let nemisId = generateNemisId();
      for (let attempt = 0; this.deps.students.existsByNemisId(nemisId); attempt++) {
        if (attempt >= 100) {
          throw new WorkflowException('Could not mint a unique NEMIS ID.');
        }
        nemisId = generateNemisId();
      }

      const occurredAt = this.deps.clock.now();
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
        admissionDate: command.admissionDate ?? occurredAt.slice(0, 10),
        phoneNumber: command.phoneNumber,
        email: command.email,
        address: command.address,
        occurredAt,
      });

      this.deps.unitOfWork.run(() => this.deps.students.save(student));

      const event: StudentRegistered = {
        name: 'StudentRegistered',
        occurredAt,
        studentId: student.id,
        institutionId: student.institutionId,
        nemisId: student.nemisId.value,
      };
      this.deps.events.publish(event);

      return ok(toStudentOutput(student));
    });
  }
}
