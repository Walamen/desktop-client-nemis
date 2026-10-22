import type { HeaderNotificationsSummary } from '@nemis-desktop/types';
import type { ApplicationResponse } from '../core/response';
import type { UserOutput } from '../dto/identity/identity-dto';
import type { GetUserByIdUseCase } from '../use-cases/identity/get-user-by-id';
import type { GetCurrentUserUseCase } from '../use-cases/identity/get-current-user';
import type { GetHeaderNotificationsUseCase } from '../use-cases/identity/get-header-notifications';

export interface IdentityApplicationServiceDeps {
  getUserById: GetUserByIdUseCase;
  getCurrentUser: GetCurrentUserUseCase;
  getHeaderNotifications: GetHeaderNotificationsUseCase;
}

export class IdentityApplicationService {
  constructor(private readonly deps: IdentityApplicationServiceDeps) {}
  getUserById(query: { userId: string }): Promise<ApplicationResponse<UserOutput | null>> {
    return this.deps.getUserById.execute(query);
  }
  getCurrentUser(): Promise<ApplicationResponse<UserOutput | null>> {
    return this.deps.getCurrentUser.execute({});
  }
  getHeaderNotifications(): Promise<ApplicationResponse<HeaderNotificationsSummary>> {
    return this.deps.getHeaderNotifications.execute({});
  }
}
