import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyUsersQuery, CountyUsersResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyUsersState {
  readonly summary: AsyncState<CountyUsersResult>;
  /** The last query loaded (filters and page). */
  readonly query: CountyUsersQuery;
}

export interface CountyUsersViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Administrative Users list page (rows and stats in one). */
export class CountyUsersViewModel {
  readonly store = createStore<CountyUsersState>(() => ({
    summary: idleState(),
    query: { page: 1, limit: 12 },
  }));

  constructor(private readonly deps: CountyUsersViewModelDeps) {}

  async load(query: CountyUsersQuery): Promise<void> {
    this.store.setState({ query });
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.deps.county.listUsers(query),
      map: (result) => result,
    });
  }
}
