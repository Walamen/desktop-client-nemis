import type { CountyApplicationService } from '@nemis-desktop/application';
import type {
  CountyFeeCollectionsQuery,
  CountyFeeCollectionsResult,
  CountyFinanceDashboard,
  CountySchoolFinanceRow,
} from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyFinanceState {
  readonly dashboard: AsyncState<CountyFinanceDashboard>;
  /** The All Schools tab; loaded only when opened. */
  readonly schools: AsyncState<CountySchoolFinanceRow[]>;
  /** The Payments tab; loaded only when opened. */
  readonly payments: AsyncState<CountyFeeCollectionsResult>;
  /** The last payments query loaded (filters and page). */
  readonly paymentsQuery: CountyFeeCollectionsQuery;
}

export interface CountyFinanceViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Finance overview page: the cards and district comparison, and the
 * two lazily loaded tabs (portal-web's four queries). Empty lists are a
 * success, so the page shows its own empty rows. */
export class CountyFinanceViewModel {
  readonly store = createStore<CountyFinanceState>(() => ({
    dashboard: idleState(),
    schools: idleState(),
    payments: idleState(),
    paymentsQuery: { page: 1, limit: 50 },
  }));

  constructor(private readonly deps: CountyFinanceViewModelDeps) {}

  async loadDashboard(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().dashboard,
        set: (dashboard) => this.store.setState({ dashboard }),
      },
      fetch: () => this.deps.county.getFinanceDashboard(),
      map: (result) => result,
    });
  }

  async loadSchools(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().schools,
        set: (schools) => this.store.setState({ schools }),
      },
      fetch: () => this.deps.county.listFinanceSchools(),
      map: (rows) => rows,
    });
  }

  async loadPayments(query: CountyFeeCollectionsQuery): Promise<void> {
    this.store.setState({ paymentsQuery: query });
    await trackQuery({
      access: {
        get: () => this.store.getState().payments,
        set: (payments) => this.store.setState({ payments }),
      },
      fetch: () => this.deps.county.listFeeCollections(query),
      map: (result) => result,
    });
  }
}
