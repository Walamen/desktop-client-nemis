import type { DeoApplicationService } from '@nemis-desktop/application';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState, type PresentationErrorLike } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';
import { toPresentationError } from '../../errors';
import type { DeoDashboardView } from './deo-dashboard-views';

export interface DeoDashboardState {
  readonly summary: AsyncState<DeoDashboardView>;
  /** The alert whose "Mark Reviewed" is in flight, if any. */
  readonly resolvingAlertId: string | null;
  /** Why the last "Mark Reviewed" failed; cleared by the next attempt. */
  readonly resolveError: PresentationErrorLike | null;
}

export interface DeoDashboardViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** The DEO (district) dashboard. No isEmpty: a district with no schools, and
 * an officer with no district, still render the page (the latter as the
 * "No District Assignment" card). Search, filters and paging are page state
 * over the pure helpers in deo-dashboard-views.ts. */
export class DeoDashboardViewModel {
  readonly store = createStore<DeoDashboardState>(() => ({
    summary: idleState(),
    resolvingAlertId: null,
    resolveError: null,
  }));

  constructor(private readonly deps: DeoDashboardViewModelDeps) {}

  async loadDashboard(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().summary,
        set: (summary) => this.store.setState({ summary }),
      },
      fetch: () => this.deps.deo.getDashboard(),
      map: (dashboard): DeoDashboardView => dashboard,
    });
  }

  /** "Mark Reviewed": written on this device, synced later. Reloads so the
   * alert leaves both lists and the school's standing is recomputed. Never
   * throws; one at a time. */
  async resolveAlert(alertId: string): Promise<void> {
    if (this.store.getState().resolvingAlertId) return;
    this.store.setState({ resolvingAlertId: alertId, resolveError: null });
    try {
      await this.deps.deo.resolveAlert(alertId);
      await this.loadDashboard();
    } catch (err) {
      this.store.setState({ resolveError: toPresentationError(err, 'command') });
    } finally {
      this.store.setState({ resolvingAlertId: null });
    }
  }
}
