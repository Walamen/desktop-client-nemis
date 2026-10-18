import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyGuardiansQuery, CountyGuardiansResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyGuardiansState {
  readonly summary: AsyncState<CountyGuardiansResult>;
  /** The last query loaded (filters and page). */
  readonly query: CountyGuardiansQuery;
}

export interface CountyGuardiansViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Parents & Guardians list page (portal-web's four queries in one). */
export class CountyGuardiansViewModel {
  readonly store = createStore<CountyGuardiansState>(() => ({
    summary: idleState(),
    query: { page: 1, limit: 12 },
  }));

  constructor(private readonly deps: CountyGuardiansViewModelDeps) {}

  async load(query: CountyGuardiansQuery): Promise<void> {
    this.store.setState({ query });
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.deps.county.listGuardians(query),
      map: (result) => result,
    });
  }
}
