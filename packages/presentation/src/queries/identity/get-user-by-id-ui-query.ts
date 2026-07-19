import type {
  ApplicationResponse,
  IdentityApplicationService,
  UserOutput,
} from '@nemis-desktop/application';

export class GetUserByIdUiQuery {
  constructor(private readonly identity: IdentityApplicationService) {}

  execute(userId: string): Promise<ApplicationResponse<UserOutput | null>> {
    return this.identity.getUserById({ userId });
  }
}
