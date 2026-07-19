import type { PagedResult, StudentApplicationService, StudentSummaryOutput } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import type { NotificationStore } from '../../stores/notification-store';
import type { DashboardStat, DashboardSummaryView } from './dashboard-views';

export interface DashboardState {
  readonly summary: AsyncState<DashboardSummaryView>;
}

export interface DashboardViewModelDeps {
  readonly students: StudentApplicationService;
  readonly notifications: NotificationStore;
}

/** A wide page size so the total reflects the whole roster. Real production
 * summaries (a dedicated count query) arrive with the sync/reporting phase. */
const COUNT_PAGE: Readonly<{ limit: number; offset: number }> = { limit: 1000, offset: 0 };

const PLACEHOLDER_STATS: readonly Omit<DashboardStat, 'placeholder'>[] = [
  { key: 'total-teachers', label: 'Total Teachers', value: 0 },
  { key: 'total-classes', label: 'Total Classes', value: 0 },
  { key: 'avg-class-size', label: 'Avg Class Size', value: 0 },
  { key: 'male-students', label: 'Male Students', value: 0 },
  { key: 'female-students', label: 'Female Students', value: 0 },
];

export class DashboardViewModel {
  readonly store = createStore<DashboardState>(() => ({ summary: idleState() }));

  constructor(private readonly deps: DashboardViewModelDeps) {}

  async loadSummary(): Promise<void> {
    await trackQuery<PagedResult<StudentSummaryOutput>, DashboardSummaryView>({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.deps.students.list(COUNT_PAGE),
      map: (page) => ({
        totalStudents: page.total,
        stats: [
          { key: 'total-students', label: 'Total Students', value: page.total, placeholder: false },
          ...PLACEHOLDER_STATS.map((s) => ({ ...s, placeholder: true })),
        ],
      }),
    });
  }
}
