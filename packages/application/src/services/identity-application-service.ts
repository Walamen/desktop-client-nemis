import type { ApplicationResponse } from '../core/response';
import type { UserOutput } from '../dto/identity/identity-dto';
import type { GetUserByIdUseCase } from '../use-cases/identity/get-user-by-id';

export interface IdentityApplicationServiceDeps {
  getUserById: GetUserByIdUseCase;
}

export class IdentityApplicationService {
  constructor(private readonly deps: IdentityApplicationServiceDeps) {}
  getUserById(query: { userId: string }): Promise<ApplicationResponse<UserOutput | null>> {
    return this.deps.getUserById.execute(query);
  }
}
