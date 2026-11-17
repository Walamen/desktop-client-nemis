import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoFinanceAuditEntry, DeoFinanceResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoFinanceState {
  readonly finance: AsyncState<DeoFinanceResult>;
  /** Loaded once the Audit Logs tab is first opened. */
  readonly audit: AsyncState<DeoFinanceAuditEntry[]>;
}

export interface DeoFinanceViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO Finance. No isEmpty: a district without fees still renders the page
 * with its tabs and empty tables. */
export class DeoFinanceViewModel {
  readonly store = createStore<DeoFinanceState>(() => ({ finance: idleState(), audit: idleState() }));

  constructor(private readonly deps: DeoFinanceViewModelDeps) {}

  async loadFinance(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().finance,
        set: (finance) => this.store.setState({ finance }),
      },
      fetch: () => this.deps.deo.getFinance(),
      map: (result): DeoFinanceResult => result,
    });
  }

  async loadAudit(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().audit,
        set: (audit) => this.store.setState({ audit }),
      },
      fetch: () => this.deps.deo.listFinanceAudit(),
      map: (result): DeoFinanceAuditEntry[] => result,
    });
  }
}
