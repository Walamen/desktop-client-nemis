import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { UserOutput } from '../../dto/identity/identity-dto';
import type { IUserRepository } from '../../interfaces/identity/user-repository';
import type { IAppLogger } from '../../interfaces/app-logger';
import { toUserOutput } from '../../mappers/identity/user-mapper';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetCurrentUserDeps {
  users: IUserRepository;
  logger: IAppLogger;
}

export class GetCurrentUserUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<UserOutput | null>
> {
  constructor(private readonly deps: GetCurrentUserDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<UserOutput | null>> {
    return invokeUseCase('GetCurrentUser', this.deps.logger, async () => {
      const user = this.deps.users.findFirst();
      return ok(user ? toUserOutput(user) : null);
    });
  }
}
