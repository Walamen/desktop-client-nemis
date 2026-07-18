import { Grade } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type { RecordGradeDto, GradeOutput } from '../../dto/assessments/assessments-dto';
import type { IGradeRepository } from '../../interfaces/assessments/grade-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IClock } from '../../interfaces/clock';
import type { IIdGenerator } from '../../interfaces/id-generator';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toGradeOutput } from '../../mappers/assessments/grade-mapper';
import { requireFields } from '../../validators/validate';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface RecordGradeDeps {
  grades: IGradeRepository;
  unitOfWork: IUnitOfWork;
  clock: IClock;
  ids: IIdGenerator;
  logger: IAppLogger;
}

export class RecordGradeUseCase implements CommandHandler<
  RecordGradeDto,
  ApplicationResponse<GradeOutput>
> {
  constructor(private readonly deps: RecordGradeDeps) {}

  execute(command: RecordGradeDto): Promise<ApplicationResponse<GradeOutput>> {
    return invokeUseCase('RecordGrade', this.deps.logger, async () => {
      requireFields(command, ['studentId', 'subjectId', 'status']);
      const grade = Grade.create({
        id: this.deps.ids.next(),
        studentId: command.studentId,
        subjectId: command.subjectId,
        obtained: command.obtained,
        total: command.total,
        status: command.status,
        occurredAt: this.deps.clock.now(),
      });
      this.deps.unitOfWork.run(() => this.deps.grades.save(grade));
      return ok(toGradeOutput(grade));
    });
  }
}
