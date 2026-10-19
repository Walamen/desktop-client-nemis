import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyUserOptions } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyUserOptionsState {
  readonly options: AsyncState<CountyUserOptions>;
}

export interface CountyUserOptionsViewModelDeps {
  readonly county: CountyApplicationService;
}

/** District and school choices for the County Users filters and forms (local data). */
export class CountyUserOptionsViewModel {
  readonly store = createStore<CountyUserOptionsState>(() => ({ options: idleState() }));

  constructor(private readonly deps: CountyUserOptionsViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().options,
        set: (options) => this.store.setState({ options }),
      },
      fetch: () => this.deps.county.getUserOptions(),
      map: (options) => options,
    });
  }
}
