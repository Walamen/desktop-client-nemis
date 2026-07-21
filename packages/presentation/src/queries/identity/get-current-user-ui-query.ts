import type { ApplicationResponse, IdentityApplicationService, UserOutput } from '@nemis-desktop/application';

export class GetCurrentUserUiQuery {
  constructor(private readonly identity: IdentityApplicationService) {}
  execute(): Promise<ApplicationResponse<UserOutput | null>> {
    return this.identity.getCurrentUser();
  }
}
