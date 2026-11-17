import type { DeoApplicationService } from '@nemis-desktop/application';
import type { DeoNotificationsResult } from '@nemis-desktop/types';
import { createStore } from 'zustand/vanilla';
import { idleState, type AsyncState } from '../../core/async-state';
import { trackQuery } from '../../core/async-runner';

export interface DeoNotificationsState {
  readonly notifications: AsyncState<DeoNotificationsResult>;
}

export interface DeoNotificationsViewModelDeps {
  readonly deo: DeoApplicationService;
}

/** DEO Notifications: every notification of the signed-in DEO on this device.
 * Marking read writes locally (the outbox pushes it), then reloads. */
export class DeoNotificationsViewModel {
  readonly store = createStore<DeoNotificationsState>(() => ({ notifications: idleState() }));

  constructor(private readonly deps: DeoNotificationsViewModelDeps) {}

  async load(): Promise<void> {
    await trackQuery({
      access: {
        get: () => this.store.getState().notifications,
        set: (notifications) => this.store.setState({ notifications }),
      },
      fetch: () => this.deps.deo.listNotifications(),
      map: (result): DeoNotificationsResult => result,
    });
  }

  async markRead(notificationId: string): Promise<void> {
    await this.deps.deo.markNotificationRead(notificationId);
    await this.load();
  }

  async markAllRead(): Promise<void> {
    await this.deps.deo.markAllNotificationsRead();
    await this.load();
  }
}
