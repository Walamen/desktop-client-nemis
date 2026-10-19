import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyTeachersQuery, CountyTeachersResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyTeachersState {
  readonly summary: AsyncState<CountyTeachersResult>;
  /** The last query loaded (filters and page). */
  readonly query: CountyTeachersQuery;
}

export interface CountyTeachersViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Teachers list page (portal-web's three queries in one). */
export class CountyTeachersViewModel {
  readonly store = createStore<CountyTeachersState>(() => ({
    summary: idleState(),
    query: { page: 1, limit: 12 },
  }));

  constructor(private readonly deps: CountyTeachersViewModelDeps) {}

  async load(query: CountyTeachersQuery): Promise<void> {
    this.store.setState({ query });
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.deps.county.listTeachers(query),
      map: (result) => result,
    });
  }
}
