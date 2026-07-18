import { Assessment } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { CreateAssessmentDto, AssessmentOutput } from '../../dto/assessments/assessments-dto';
import type { IAssessmentRepository } from '../../interfaces/assessments/assessment-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toAssessmentOutput } from '../../mappers/assessments/assessment-mapper';
import { assertValid, requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { AssessmentCreated } from '../../events/assessments';

export interface CreateAssessmentDeps {
  assessments: IAssessmentRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class CreateAssessmentUseCase implements CommandHandler<
  CreateAssessmentDto,
  ApplicationResponse<AssessmentOutput>
> {
  constructor(private readonly deps: CreateAssessmentDeps) {}

  execute(command: CreateAssessmentDto): Promise<ApplicationResponse<AssessmentOutput>> {
    return invokeUseCase('CreateAssessment', this.deps.logger, async () => {
      requireFields(command, ['classId', 'subjectId', 'gradingPeriodId', 'type']);
      assertValid(command.totalMarks > 0, 'totalMarks', 'must be a positive number');

      const occurredAt = this.deps.clock.now();
      const assessment = Assessment.create({
        id: this.deps.ids.next(),
        classId: command.classId,
        subjectId: command.subjectId,
        gradingPeriodId: command.gradingPeriodId,
        type: command.type,
        totalMarks: command.totalMarks,
        occurredAt,
      });
      this.deps.unitOfWork.run(() => this.deps.assessments.save(assessment));

      const event: AssessmentCreated = {
        name: 'AssessmentCreated',
        occurredAt,
        assessmentId: assessment.id,
      };
      this.deps.events.publish(event);

      return ok(toAssessmentOutput(assessment));
    });
  }
}
