import type { CountyApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toCountyDistrictsView } from '../../mappers/county/county-districts-view-mapper';
import { GetCountyDistrictsUiQuery } from '../../queries/county/get-county-districts-ui-query';
import type { CountyDistrictsView } from './county-districts-views';

export interface CountyDistrictsState {
  readonly summary: AsyncState<CountyDistrictsView>;
}

export interface CountyDistrictsViewModelDeps {
  readonly county: CountyApplicationService;
}

/** District Management page + Manage DEO drawer. Reloaded after every DEO command. */
export class CountyDistrictsViewModel {
  readonly store = createStore<CountyDistrictsState>(() => ({ summary: idleState() }));

  private readonly query: GetCountyDistrictsUiQuery;

  constructor(deps: CountyDistrictsViewModelDeps) {
    this.query = new GetCountyDistrictsUiQuery(deps.county);
  }

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.query.execute(),
      map: toCountyDistrictsView,
    });
  }
}
