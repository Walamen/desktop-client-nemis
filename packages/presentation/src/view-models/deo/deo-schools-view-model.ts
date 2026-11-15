import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoSchoolsResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoSchoolsState {
  readonly schools: AsyncState<DeoSchoolsResult>;
}

export interface DeoSchoolsViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO Schools Management. No isEmpty: a district with no schools still
 * renders the page with its empty state. Tabs are page state over
 * deo-schools-views.ts. */
export class DeoSchoolsViewModel {
  readonly store = createStore<DeoSchoolsState>(() => ({ schools: idleState() }));

  constructor(private readonly deps: DeoSchoolsViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().schools,
        set: (schools) => this.store.setState({ schools }),
      },
      fetch: () => this.deps.deo.listSchools(),
      map: (result): DeoSchoolsResult => result,
    });
  }
}
