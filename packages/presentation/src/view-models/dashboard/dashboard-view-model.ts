import type { ReportingApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toDashboardSummaryView } from '../../mappers/reporting/dashboard-view-mapper';
import { GetDashboardOverviewUiQuery } from '../../queries/reporting/get-dashboard-overview-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { DashboardSummaryView } from './dashboard-views';

export interface DashboardState {
  readonly summary: AsyncState<DashboardSummaryView>;
}

export interface DashboardViewModelDeps {
  readonly reporting: ReportingApplicationService;
  readonly notifications: NotificationStore;
}

export class DashboardViewModel {
  readonly store = createStore<DashboardState>(() => ({ summary: idleState() }));

  private readonly overviewQuery: GetDashboardOverviewUiQuery;

  constructor(deps: DashboardViewModelDeps) {
    this.overviewQuery = new GetDashboardOverviewUiQuery(deps.reporting);
  }

  async loadOverview(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.overviewQuery.execute(),
      map: toDashboardSummaryView,
    });
  }
}
