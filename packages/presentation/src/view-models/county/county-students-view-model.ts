import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyStudentsQuery, CountyStudentsResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyStudentsState {
  readonly summary: AsyncState<CountyStudentsResult>;
  /** The last query loaded (filters and page). */
  readonly query: CountyStudentsQuery;
}

export interface CountyStudentsViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Students list page (portal-web's five queries in one). */
export class CountyStudentsViewModel {
  readonly store = createStore<CountyStudentsState>(() => ({
    summary: idleState(),
    query: { page: 1, limit: 12 },
  }));

  constructor(private readonly deps: CountyStudentsViewModelDeps) {}

  async load(query: CountyStudentsQuery): Promise<void> {
    this.store.setState({ query });
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.deps.county.listStudents(query),
      map: (result) => result,
    });
  }
}
