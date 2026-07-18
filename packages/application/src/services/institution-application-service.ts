import type { ApplicationResponse } from '../core/response';
import type {
  GradingConfigOutput,
  InstitutionProfileOutput,
  UpdateGradingConfigDto,
} from '../dto/institution/institution-dto';
import type { GetInstitutionProfileUseCase } from '../use-cases/institution/get-institution-profile';
import type { UpdateGradingConfigUseCase } from '../use-cases/institution/update-grading-config';

export interface InstitutionApplicationServiceDeps {
  getProfile: GetInstitutionProfileUseCase;
  updateGradingConfig: UpdateGradingConfigUseCase;
}

export class InstitutionApplicationService {
  constructor(private readonly deps: InstitutionApplicationServiceDeps) {}
  getProfile(
    query: { institutionId: string },
  ): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.deps.getProfile.execute(query);
  }
  updateGradingConfig(
    dto: UpdateGradingConfigDto,
  ): Promise<ApplicationResponse<GradingConfigOutput>> {
    return this.deps.updateGradingConfig.execute(dto);
  }
}
