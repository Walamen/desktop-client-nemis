import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoTransfersResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoTransfersState {
  readonly transfers: AsyncState<DeoTransfersResult>;
}

export interface DeoTransfersViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO Transfers. No isEmpty: a district with no transfers still renders
 * the page with its filters and an empty list. */
export class DeoTransfersViewModel {
  readonly store = createStore<DeoTransfersState>(() => ({ transfers: idleState() }));

  constructor(private readonly deps: DeoTransfersViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().transfers,
        set: (transfers) => this.store.setState({ transfers }),
      },
      fetch: () => this.deps.deo.listTransfers(),
      map: (result): DeoTransfersResult => result,
    });
  }
}
