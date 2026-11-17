import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoSettingsResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoSettingsState {
  readonly settings: AsyncState<DeoSettingsResult>;
}

export interface DeoSettingsViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO Settings (reads): the profile this device holds. The office address
 * and saving are online commands the page sends through the bridge. */
export class DeoSettingsViewModel {
  readonly store = createStore<DeoSettingsState>(() => ({ settings: idleState() }));

  constructor(private readonly deps: DeoSettingsViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().settings,
        set: (settings) => this.store.setState({ settings }),
      },
      fetch: () => this.deps.deo.getSettings(),
      map: (result): DeoSettingsResult => result,
    });
  }
}
