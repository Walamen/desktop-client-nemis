import type { CountyApplicationService } from '@nemis-desktop/application';
import type { CountySettings } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface CountySettingsState {
  readonly settings: AsyncState<CountySettings>;
}

export interface CountySettingsViewModelDeps {
  readonly county: CountyApplicationService;
}

/** County Settings page: the County Information card, from this device. */
export class CountySettingsViewModel {
  readonly store = createStore<CountySettingsState>(() => ({ settings: idleState() }));

  constructor(private readonly deps: CountySettingsViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: { get: () => this.store.getState().settings, set: (settings) => this.store.setState({ settings }) },
      fetch: () => this.deps.county.getCountySettings(),
      map: (settings) => settings,
    });
  }
}
