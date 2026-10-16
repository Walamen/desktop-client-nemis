import type { CountyApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toCountyDashboardView } from '../../mappers/county/county-dashboard-view-mapper';
import { GetCountyDashboardUiQuery } from '../../queries/county/get-county-dashboard-ui-query';
import type { CountyDashboardView } from './county-dashboard-views';

export interface CountyDashboardState {
  readonly summary: AsyncState<CountyDashboardView>;
}

export interface CountyDashboardViewModelDeps {
  readonly county: CountyApplicationService;
}

/** The County (CEO) dashboard. No isEmpty: an all-zero county still renders
 * the full page, as on the web. */
export class CountyDashboardViewModel {
  readonly store = createStore<CountyDashboardState>(() => ({ summary: idleState() }));

  private readonly dashboardQuery: GetCountyDashboardUiQuery;

  constructor(deps: CountyDashboardViewModelDeps) {
    this.dashboardQuery = new GetCountyDashboardUiQuery(deps.county);
  }

  async loadDashboard(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.dashboardQuery.execute(),
      map: toCountyDashboardView,
    });
  }
}
