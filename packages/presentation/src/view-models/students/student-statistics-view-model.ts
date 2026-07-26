import type { ReportingApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { GetStudentStatisticsUiQuery } from '../../queries/reporting/get-student-statistics-ui-query';
import type { NotificationStore } from '../../stores/notification-store';
import type { StudentStatisticsView } from './student-statistics-views';

export interface StudentStatisticsState {
  readonly stats: AsyncState<StudentStatisticsView>;
}

export interface StudentStatisticsViewModelDeps {
  readonly reporting: ReportingApplicationService;
  readonly notifications: NotificationStore;
}

export class StudentStatisticsViewModel {
  readonly store = createStore<StudentStatisticsState>(() => ({ stats: idleState() }));

  private readonly statisticsQuery: GetStudentStatisticsUiQuery;

  constructor(deps: StudentStatisticsViewModelDeps) {
    this.statisticsQuery = new GetStudentStatisticsUiQuery(deps.reporting);
  }

  async loadStatistics(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().stats,
        set: (stats) => this.store.setState({ stats }),
      },
      fetch: () => this.statisticsQuery.execute(),
      map: (dto): StudentStatisticsView => dto,
    });
  }
}
