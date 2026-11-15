import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoTeachersResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoTeachersState {
  readonly teachers: AsyncState<DeoTeachersResult>;
}

export interface DeoTeachersViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO Teacher Monitoring. No isEmpty: a district with no teachers still
 * renders the page, with its zero cards and an empty table. */
export class DeoTeachersViewModel {
  readonly store = createStore<DeoTeachersState>(() => ({ teachers: idleState() }));

  constructor(private readonly deps: DeoTeachersViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().teachers,
        set: (teachers) => this.store.setState({ teachers }),
      },
      fetch: () => this.deps.deo.listTeachers(),
      map: (result): DeoTeachersResult => result,
    });
  }
}
