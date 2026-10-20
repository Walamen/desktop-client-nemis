import type { CountyApplicationService } from '@nemis-desktop/application';
import type {
  CountyEnrollmentReport,
  CountyEnrollmentReportQuery,
  CountyFinanceDashboard,
  CountyReportOptions,
  CountyReportSchool,
  CountySchoolFinanceRow,
} from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyReportsState {
  /** Header (county name and code) and the District filter. */
  readonly options: AsyncState<CountyReportOptions>;
  /** The School filter for the chosen district. */
  readonly schools: AsyncState<CountyReportSchool[]>;
  readonly enrollment: AsyncState<CountyEnrollmentReport>;
  /** The Financial report reuses the County Finance figures (current year). */
  readonly financeDashboard: AsyncState<CountyFinanceDashboard>;
  readonly financeSchools: AsyncState<CountySchoolFinanceRow[]>;
  /** When the finance figures last arrived; the toolbar shows it. */
  readonly financeLoadedAt: string | null;
}

export interface CountyReportsViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Generate Reports page. Each report loads only when chosen; empty
 * lists are a success so the page draws its own empty rows. */
export class CountyReportsViewModel {
  readonly store = createStore<CountyReportsState>(() => ({
    options: idleState(),
    schools: idleState(),
    enrollment: idleState(),
    financeDashboard: idleState(),
    financeSchools: idleState(),
    financeLoadedAt: null,
  }));

  constructor(private readonly deps: CountyReportsViewModelDeps) {}

  async loadOptions(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().options, set: (options) => this.store.setState({ options }) },
      fetch: () => this.deps.county.getReportOptions(),
      map: (result) => result,
    });
  }

  /** An empty id (no single district chosen) clears the list without a call. */
  async loadSchools(districtId: string): Promise<void> {
    if (!districtId) {
      this.store.setState({ schools: { status: 'success', data: [] } });
      return;
    }
    await trackQuery({
      access: { get: () => this.store.getState().schools, set: (schools) => this.store.setState({ schools }) },
      fetch: () => this.deps.county.listReportSchools(districtId),
      map: (rows) => rows,
    });
  }

  async loadEnrollment(query: CountyEnrollmentReportQuery): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().enrollment, set: (enrollment) => this.store.setState({ enrollment }) },
      fetch: () => this.deps.county.getEnrollmentReport(query),
      map: (result) => result,
    });
  }

  async loadFinance(): Promise<void> {
    await Promise.all([
      trackQuery({
        access: {
          get: () => this.store.getState().financeDashboard,
          set: (financeDashboard) => this.store.setState({ financeDashboard }),
        },
        fetch: () => this.deps.county.getFinanceDashboard(),
        map: (result) => result,
      }),
      trackQuery({
        access: {
          get: () => this.store.getState().financeSchools,
          set: (financeSchools) => this.store.setState({ financeSchools }),
        },
        fetch: () => this.deps.county.listFinanceSchools(),
        map: (rows) => rows,
      }),
    ]);
    this.store.setState({ financeLoadedAt: new Date().toISOString() });
  }
}
