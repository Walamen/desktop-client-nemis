import { GradingConfig } from '@nemis-desktop/domain';
import type { CommandHandler } from '../../core/command';
import { ok, type ApplicationResponse } from '../../core/response';
import type {
  UpdateGradingConfigDto,
  GradingConfigOutput,
} from '../../dto/institution/institution-dto';
import type { IGradingConfigRepository } from '../../interfaces/institution/grading-config-repository';
import type { IUnitOfWork } from '../../interfaces/unit-of-work';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toGradingConfigOutput } from '../../mappers/institution/grading-config-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface UpdateGradingConfigDeps {
  configs: IGradingConfigRepository;
  unitOfWork: IUnitOfWork;
  logger: IAppLogger;
}

export class UpdateGradingConfigUseCase
  implements CommandHandler<UpdateGradingConfigDto, ApplicationResponse<GradingConfigOutput>>
{
  constructor(private readonly deps: UpdateGradingConfigDeps) {}

  execute(command: UpdateGradingConfigDto): Promise<ApplicationResponse<GradingConfigOutput>> {
    return invokeUseCase('UpdateGradingConfig', this.deps.logger, async () => {
      // reconstitute enforces the passingMarks <= maxMarks invariant (throws a domain
      // EntityValidationException, translated by the pipeline to a UseCaseException).
      const config = GradingConfig.reconstitute({
        id: command.id,
        maxMarks: command.maxMarks,
        passingMarks: command.passingMarks,
        requireAdminApproval: command.requireAdminApproval,
      });
      this.deps.unitOfWork.run(() => this.deps.configs.save(config));
      return ok(toGradingConfigOutput(config));
    });
  }
}
