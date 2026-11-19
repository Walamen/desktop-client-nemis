import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoReportsComplianceResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoReportsComplianceState {
  readonly compliance: AsyncState<DeoReportsComplianceResult>;
}

export interface DeoReportsComplianceViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO Reports & Compliance: the district-wide compliance overview. */
export class DeoReportsComplianceViewModel {
  readonly store = createStore<DeoReportsComplianceState>(() => ({ compliance: idleState() }));

  constructor(private readonly deps: DeoReportsComplianceViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().compliance,
        set: (compliance) => this.store.setState({ compliance }),
      },
      fetch: () => this.deps.deo.getReportsCompliance(),
      map: (result): DeoReportsComplianceResult => result,
    });
  }
}
