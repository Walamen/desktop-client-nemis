import type { IdentityApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toUserView } from '../../mappers/identity/user-view-mapper';
import { GetUserByIdUiQuery } from '../../queries/identity/get-user-by-id-ui-query';
import { GetCurrentUserUiQuery } from '../../queries/identity/get-current-user-ui-query';
import type { SessionStore } from '../../stores/session-store';
import type { UserView } from './current-user-views';

export interface CurrentUserState {
  readonly user: AsyncState<UserView>;
}

export interface CurrentUserViewModelDeps {
  readonly identity: IdentityApplicationService;
  readonly session: SessionStore;
}

export class CurrentUserViewModel {
  readonly store = createStore<CurrentUserState>(() => ({ user: idleState() }));

  private readonly userQuery: GetUserByIdUiQuery;
  private readonly currentUserQuery: GetCurrentUserUiQuery;

  constructor(private readonly deps: CurrentUserViewModelDeps) {
    this.userQuery = new GetUserByIdUiQuery(deps.identity);
    this.currentUserQuery = new GetCurrentUserUiQuery(deps.identity);
  }

  async loadUser(userId: string): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().user,
        set: (user) => this.store.setState({ user }),
      },
      fetch: () => this.userQuery.execute(userId),
      onData: (dto) => this.deps.session.setCurrentUser(dto.id),
      map: toUserView,
    });
    if (this.store.getState().user.status === 'empty') {
      this.deps.session.setCurrentUser(null);
    }
  }

  async loadCurrentUser(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().user,
        set: (user) => this.store.setState({ user }),
      },
      fetch: () => this.currentUserQuery.execute(),
      onData: (dto) => this.deps.session.setCurrentUser(dto.id),
      map: toUserView,
    });
    if (this.store.getState().user.status === 'empty') {
      this.deps.session.setCurrentUser(null);
    }
  }
}
