import { Subject } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CreateSubjectDto, SubjectOutput } from '../../dto/academics/academics-dto';
import type { ISubjectRepository } from '../../interfaces/academics/subject-repository';
import type { IInstitutionRepository } from '../../interfaces/institution/institution-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toSubjectOutput } from '../../mappers/academics/subject-mapper';
import { requireFields } from '../../validators/validate';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface CreateSubjectDeps {
  subjects: ISubjectRepository;
  institutions: IInstitutionRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class CreateSubjectUseCase implements CommandHandler<
  CreateSubjectDto,
  ApplicationResponse<SubjectOutput>
> {
  constructor(private readonly deps: CreateSubjectDeps) {}

  execute(command: CreateSubjectDto): Promise<ApplicationResponse<SubjectOutput>> {
    return invokeUseCase('CreateSubject', this.deps.logger, async () => {
      requireFields(command, ['name', 'code']);

      const institution = this.deps.institutions.findFirst();
      if (!institution) {
        throw new WorkflowException('No school is configured on this device yet.');
      }
      // Subject.create() normalizes codes to uppercase; check duplicates the
      // same way so "math" and "MATH" collide.
      const normalizedCode = command.code.trim().toUpperCase();
      if (this.deps.subjects.existsByCode(institution.id, normalizedCode)) {
        throw new WorkflowException(
          `A subject with code "${normalizedCode}" already exists.`,
        );
      }

      const occurredAt = this.deps.clock.now();
      const subject = Subject.create({
        id: this.deps.ids.next(),
        institutionId: institution.id,
        name: command.name,
        code: command.code,
        description: command.description,
        occurredAt,
      });

      this.deps.unitOfWork.run(() => this.deps.subjects.save(subject));

      for (const event of subject.pullDomainEvents()) this.deps.events.publish(event);

      return ok(toSubjectOutput(subject, 0));
    });
  }
}
