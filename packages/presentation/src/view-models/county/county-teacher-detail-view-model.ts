import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyTeacherDetail } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyTeacherDetailState {
  readonly detail: AsyncState<CountyTeacherDetail>;
  /** The teacher the latest load was for — `detail` may still describe an
   * earlier one, since this view model outlives the page. */
  readonly requestedId: string | null;
}

export interface CountyTeacherDetailViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County teacher profile page, from this device's data. */
export class CountyTeacherDetailViewModel {
  readonly store = createStore<CountyTeacherDetailState>(() => ({ detail: idleState(), requestedId: null }));

  constructor(private readonly deps: CountyTeacherDetailViewModelDeps) {}

  async load(teacherId: string): Promise<void> {
    this.store.setState({ requestedId: teacherId });
    await trackQuery({
      access: {
        get: () => this.store.getState().detail,
        set: (detail) => this.store.setState({ detail }),
      },
      fetch: () => this.deps.county.getTeacher(teacherId),
      map: (detail) => detail as CountyTeacherDetail,
      isEmpty: (detail) => detail === null,
    });
  }
}
