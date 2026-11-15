import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoSchoolAdminsResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoSchoolAdminsState {
  readonly directory: AsyncState<DeoSchoolAdminsResult>;
}

export interface DeoSchoolAdminsViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO School Admin Directory. No isEmpty: a district with no School Admins
 * still renders the page (with the schools that have none). */
export class DeoSchoolAdminsViewModel {
  readonly store = createStore<DeoSchoolAdminsState>(() => ({ directory: idleState() }));

  constructor(private readonly deps: DeoSchoolAdminsViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().directory,
        set: (directory) => this.store.setState({ directory }),
      },
      fetch: () => this.deps.deo.listSchoolAdmins(),
      map: (result): DeoSchoolAdminsResult => result,
    });
  }
}
