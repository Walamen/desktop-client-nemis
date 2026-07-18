import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { UserOutput } from '../../dto/identity/identity-dto';
import type { IUserRepository } from '../../interfaces/identity/user-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toUserOutput } from '../../mappers/identity/user-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetUserByIdDeps {
  users: IUserRepository;
  logger: IAppLogger;
}

export class GetUserByIdUseCase implements QueryHandler<
  { userId: string },
  ApplicationResponse<UserOutput | null>
> {
  constructor(private readonly deps: GetUserByIdDeps) {}

  execute(query: { userId: string }): Promise<ApplicationResponse<UserOutput | null>> {
    return invokeUseCase('GetUserById', this.deps.logger, async () => {
      const user = this.deps.users.findById(query.userId);
      return ok(user ? toUserOutput(user) : null);
    });
  }
}
