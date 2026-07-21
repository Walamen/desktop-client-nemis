import type { AcademicsApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toAcademicYearView } from '../../mappers/academics/academic-year-view-mapper';
import { GetCurrentAcademicYearUiQuery } from '../../queries/academics/get-current-academic-year-ui-query';
import type { AcademicYearView } from './academic-year-views';

export interface AcademicYearState {
  readonly current: AsyncState<AcademicYearView>;
}

export interface AcademicYearViewModelDeps {
  readonly academics: AcademicsApplicationService;
}

export class AcademicYearViewModel {
  readonly store = createStore<AcademicYearState>(() => ({ current: idleState() }));

  private readonly currentQuery: GetCurrentAcademicYearUiQuery;

  constructor(deps: AcademicYearViewModelDeps) {
    this.currentQuery = new GetCurrentAcademicYearUiQuery(deps.academics);
  }

  async loadCurrent(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().current,
        set: (current) => this.store.setState({ current }),
      },
      fetch: () => this.currentQuery.execute(),
      map: toAcademicYearView,
    });
  }
}
