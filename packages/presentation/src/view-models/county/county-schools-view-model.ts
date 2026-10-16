import type { CountyApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toCountySchoolsView } from '../../mappers/county/county-schools-view-mapper';
import { GetCountySchoolsUiQuery } from '../../queries/county/get-county-schools-ui-query';
import type { CountySchoolsView } from './county-schools-views';

export interface CountySchoolsState {
  readonly summary: AsyncState<CountySchoolsView>;
}

export interface CountySchoolsViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Schools list page. */
export class CountySchoolsViewModel {
  readonly store = createStore<CountySchoolsState>(() => ({ summary: idleState() }));

  private readonly query: GetCountySchoolsUiQuery;

  constructor(deps: CountySchoolsViewModelDeps) {
    this.query = new GetCountySchoolsUiQuery(deps.county);
  }

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.query.execute(),
      map: toCountySchoolsView,
    });
  }
}
