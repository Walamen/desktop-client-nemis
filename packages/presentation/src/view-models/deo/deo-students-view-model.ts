import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoStudentsResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoStudentsState {
  readonly enrollment: AsyncState<DeoStudentsResult>;
}

export interface DeoStudentsViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO Students & Enrollment. No isEmpty: a district with no schools still
 * renders the page with zero cards and an empty table. */
export class DeoStudentsViewModel {
  readonly store = createStore<DeoStudentsState>(() => ({ enrollment: idleState() }));

  constructor(private readonly deps: DeoStudentsViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().enrollment,
        set: (enrollment) => this.store.setState({ enrollment }),
      },
      fetch: () => this.deps.deo.listStudents(),
      map: (result): DeoStudentsResult => result,
    });
  }
}
