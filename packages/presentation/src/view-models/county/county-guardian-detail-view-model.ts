import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountyGuardianDetail } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountyGuardianDetailState {
  readonly detail: AsyncState<CountyGuardianDetail>;
  /** The guardian the latest load was for — `detail` may still describe an
   * earlier one, since this view model outlives the page. */
  readonly requestedId: string | null;
}

export interface CountyGuardianDetailViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County parent profile page (local data). */
export class CountyGuardianDetailViewModel {
  readonly store = createStore<CountyGuardianDetailState>(() => ({ detail: idleState(), requestedId: null }));

  constructor(private readonly deps: CountyGuardianDetailViewModelDeps) {}

  async load(guardianId: string): Promise<void> {
    this.store.setState({ requestedId: guardianId });
    await trackQuery({
      access: {
        get: () => this.store.getState().detail,
        set: (detail) => this.store.setState({ detail }),
      },
      fetch: () => this.deps.county.getGuardian(guardianId),
      map: (detail) => detail as CountyGuardianDetail,
      isEmpty: (detail) => detail === null,
    });
  }
}
