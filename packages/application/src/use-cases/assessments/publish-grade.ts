import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { PublishGradeDto, GradeOutput } from '../../dto/assessments/assessments-dto';
import type { IGradeRepository } from '../../interfaces/assessments/grade-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IEventPublisher } from '../../interfaces/event-publisher';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toGradeOutput } from '../../mappers/assessments/grade-mapper';
import { WorkflowException } from '../../exceptions';
import { invokeUseCase } from '../../pipeline/use-case-invoker';
import type { GradePublished } from '../../events/assessments';

export interface PublishGradeDeps {
  grades: IGradeRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  events: IEventPublisher;
  logger: IAppLogger;
}

export class PublishGradeUseCase implements CommandHandler<
  PublishGradeDto,
  ApplicationResponse<GradeOutput>
> {
  constructor(private readonly deps: PublishGradeDeps) {}

  execute(command: PublishGradeDto): Promise<ApplicationResponse<GradeOutput>> {
    return invokeUseCase('PublishGrade', this.deps.logger, async () => {
      const grade = this.deps.grades.findById(command.gradeId);
      if (!grade) {
        throw new WorkflowException(`Grade ${command.gradeId} does not exist.`);
      }
      const at = this.deps.clock.now();
      grade.publish(command.actorId, at);
      this.deps.unitOfWork.run(() => this.deps.grades.save(grade));

      const event: GradePublished = {
        name: 'GradePublished',
        occurredAt: at,
        gradeId: grade.id,
        studentId: grade.studentId,
        subjectId: grade.subjectId,
      };
      this.deps.events.publish(event);

      return ok(toGradeOutput(grade));
    });
  }
}
