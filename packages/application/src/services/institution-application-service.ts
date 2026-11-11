import type { SchoolUsersResult } from '@nemis-desktop/types';
import type { ApplicationResponse } from '../core/response';
import type {
  GradingConfigOutput,
  InstitutionProfileOutput,
  InstitutionSummaryOutput,
  UpdateGradingConfigDto,
} from '../dto/institution/institution-dto';
import type { GetInstitutionProfileUseCase } from '../use-cases/institution/get-institution-profile';
import type { UpdateGradingConfigUseCase } from '../use-cases/institution/update-grading-config';
import type { GetCurrentSchoolUseCase } from '../use-cases/institution/get-current-school';
import type { ListInstitutionsUseCase } from '../use-cases/institution/list-institutions';
import type { GetSchoolUsersUseCase } from '../use-cases/institution/get-school-users';

export interface InstitutionApplicationServiceDeps {
  getProfile: GetInstitutionProfileUseCase;
  updateGradingConfig: UpdateGradingConfigUseCase;
  getCurrentSchool: GetCurrentSchoolUseCase;
  listInstitutions: ListInstitutionsUseCase;
  listSchoolUsers: GetSchoolUsersUseCase;
}

export class InstitutionApplicationService {
  constructor(private readonly deps: InstitutionApplicationServiceDeps) {}
  getProfile(query: {
    institutionId: string;
  }): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.deps.getProfile.execute(query);
  }
  updateGradingConfig(
    dto: UpdateGradingConfigDto,
  ): Promise<ApplicationResponse<GradingConfigOutput>> {
    return this.deps.updateGradingConfig.execute(dto);
  }
  getCurrentSchool(): Promise<ApplicationResponse<InstitutionProfileOutput | null>> {
    return this.deps.getCurrentSchool.execute({});
  }
  listInstitutions(): Promise<ApplicationResponse<InstitutionSummaryOutput[]>> {
    return this.deps.listInstitutions.execute({});
  }
  /** Users & Access accounts as this device holds them (the offline fallback). */
  listSchoolUsers(query: {
    institutionId: string;
  }): Promise<ApplicationResponse<SchoolUsersResult>> {
    return this.deps.listSchoolUsers.execute(query);
  }
}
