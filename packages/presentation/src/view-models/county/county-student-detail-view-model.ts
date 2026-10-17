import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyStudentDetail } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyStudentDetailState {
  readonly detail: AsyncState<CountyStudentDetail>;
  /** The student the latest load was for — `detail` may still describe an
   * earlier one, since this view model outlives the page. */
  readonly requestedId: string | null;
}

export interface CountyStudentDetailViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County student detail page (local data; the online record is merged by the page). */
export class CountyStudentDetailViewModel {
  readonly store = createStore<CountyStudentDetailState>(() => ({ detail: idleState(), requestedId: null }));

  constructor(private readonly deps: CountyStudentDetailViewModelDeps) {}

  async load(studentId: string): Promise<void> {
    this.store.setState({ requestedId: studentId });
    await trackQuery({
      access: {
        get: () => this.store.getState().detail,
        set: (detail) => this.store.setState({ detail }),
      },
      fetch: () => this.deps.county.getStudent(studentId),
      map: (detail) => detail as CountyStudentDetail,
      isEmpty: (detail) => detail === null,
    });
  }
}
