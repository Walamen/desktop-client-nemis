import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoAlertFilter, DeoAlertsResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoAlertsState {
  readonly alerts: AsyncState<DeoAlertsResult>;
  readonly filter: DeoAlertFilter;
  readonly page: number;
  /** The alert whose "Mark Reviewed" is in flight, if any. */
  readonly resolvingAlertId: string | null;
  /** The alert the last "Mark Reviewed" did not take for; cleared by the next attempt. */
  readonly failedAlertId: string | null;
}

export interface DeoAlertsViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** The DEO Alerts page: one page of the district's alerts, open / resolved /
 * all. The filter and page live here and are the source of truth for load(). */
export class DeoAlertsViewModel {
  readonly store = createStore<DeoAlertsState>(() => ({
    alerts: idleState(),
    filter: 'open',
    page: 1,
    resolvingAlertId: null,
    failedAlertId: null,
  }));

  constructor(private readonly deps: DeoAlertsViewModelDeps) {}

  async load(): Promise<void> {
    const { filter, page } = this.store.getState();
    await trackQuery({
      access: {
        get: () => this.store.getState().alerts,
        set: (alerts) => this.store.setState({ alerts }),
      },
      fetch: () => this.deps.deo.listAlerts({ filter, page }),
      map: (result): DeoAlertsResult => result,
      onData: (result) => {
        // A past-the-end page comes back clamped; follow it.
        if (result.meta.page !== page) this.store.setState({ page: result.meta.page });
      },
    });
  }

  async setFilter(filter: DeoAlertFilter): Promise<void> {
    this.store.setState({ filter, page: 1, failedAlertId: null });
    await this.load();
  }

  async setPage(page: number): Promise<void> {
    this.store.setState({ page, failedAlertId: null });
    await this.load();
  }

  /** "Mark Reviewed": written on this device, synced later. Reloads so the
   * alert leaves the open list. Never throws; one at a time. */
  async resolve(alertId: string): Promise<void> {
    if (this.store.getState().resolvingAlertId) return;
    this.store.setState({ resolvingAlertId: alertId, failedAlertId: null });
    try {
      const done = await this.deps.deo.resolveAlert(alertId);
      await this.load();
      if (!done.data) {
        const current = this.store.getState().alerts;
        const stillOpen =
          current.status === 'success' &&
          current.data.alerts.some((alert) => alert.id === alertId && !alert.isResolved);
        if (stillOpen) this.store.setState({ failedAlertId: alertId });
      }
    } catch {
      this.store.setState({ failedAlertId: alertId });
    } finally {
      this.store.setState({ resolvingAlertId: null });
    }
  }
}
