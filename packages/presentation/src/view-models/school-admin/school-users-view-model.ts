import type { SchoolUsersResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface SchoolUsersState {
  readonly users: AsyncState<SchoolUsersResult>;
}

export interface SchoolUsersViewModelDeps {
  /** Users & Access list from the main process: the server when online, else
   * the accounts stored on this device (the renderer wires the IPC bridge). */
  readonly loadSchoolUsers?: () => Promise<SchoolUsersResult>;
}

/** School Admin Users & Access list. Commands (create, edit, enable/disable)
 * are online-only and go through the bridge; the page calls load() after. */
export class SchoolUsersViewModel {
  readonly store = createStore<SchoolUsersState>(() => ({ users: idleState() }));

  constructor(private readonly deps: SchoolUsersViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().users,
        set: (users) => this.store.setState({ users }),
      },
      fetch: async () => {
        const loadSchoolUsers = this.deps.loadSchoolUsers;
        if (!loadSchoolUsers) throw new Error('Users & Access is not available here.');
        return { data: await loadSchoolUsers() };
      },
      map: (result) => result,
    });
  }
}
