import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyFeeRulesQuery, CountyFeeRulesResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyFeeRulesState {
  readonly rules: AsyncState<CountyFeeRulesResult>;
  /** The last query loaded (filters and page). */
  readonly query: CountyFeeRulesQuery;
}

export interface CountyFeeRulesViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Fee Rules page: one page of schools, each with its rules. */
export class CountyFeeRulesViewModel {
  readonly store = createStore<CountyFeeRulesState>(() => ({
    rules: idleState(),
    query: { page: 1, limit: 10 },
  }));

  constructor(private readonly deps: CountyFeeRulesViewModelDeps) {}

  async load(query: CountyFeeRulesQuery): Promise<void> {
    this.store.setState({ query });
    await trackQuery({
      access: {
        get: () => this.store.getState().rules,
        set: (rules) => this.store.setState({ rules }),
      },
      fetch: () => this.deps.county.listFeeRules(query),
      map: (result) => result,
    });
  }
}
