import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoSchoolDetailResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoSchoolDetailState {
  readonly detail: AsyncState<DeoSchoolDetailResult>;
  readonly requestedId: string | null;
}

export interface DeoSchoolDetailViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO School detail. No isEmpty: the page reads `school === null` itself
 * (not found, or outside the officer's district). */
export class DeoSchoolDetailViewModel {
  readonly store = createStore<DeoSchoolDetailState>(() => ({ detail: idleState(), requestedId: null }));

  constructor(private readonly deps: DeoSchoolDetailViewModelDeps) {}

  async load(schoolId: string): Promise<void> {
    this.store.setState({ requestedId: schoolId });
    await trackQuery({
      access: {
        get: () => this.store.getState().detail,
        set: (detail) => this.store.setState({ detail }),
      },
      fetch: () => this.deps.deo.getSchool(schoolId),
      map: (result): DeoSchoolDetailResult => result,
    });
  }
}
