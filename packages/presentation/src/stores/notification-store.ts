import { createStore } from 'zustand/vanilla';
import {
  AUTO_DISMISS_MS,
  type NotificationKind,
  type UiNotification,
} from '../notifications/notification';

export interface NotificationState {
  readonly notifications: readonly UiNotification[];
}

export class NotificationStore {
  readonly store = createStore<NotificationState>(() => ({ notifications: [] }));
  private readonly autoDismiss: Readonly<Record<NotificationKind, number | null>>;
  private seq = 0;

  constructor(autoDismissOverrides?: Partial<Record<NotificationKind, number | null>>) {
    this.autoDismiss = { ...AUTO_DISMISS_MS, ...autoDismissOverrides };
  }

  notify(
    kind: NotificationKind,
    message: string,
    options?: { autoDismissMs?: number | null },
  ): string {
    this.seq += 1;
    const id = `ntf-${this.seq}`;
    const notification: UiNotification = {
      id,
      kind,
      message,
      autoDismissMs:
        options?.autoDismissMs !== undefined ? options.autoDismissMs : this.autoDismiss[kind],
      createdAt: Date.now(),
    };
    this.store.setState((s) => ({ notifications: [...s.notifications, notification] }));
    return id;
  }

  success(message: string): string {
    return this.notify('success', message);
  }
  info(message: string): string {
    return this.notify('info', message);
  }
  warning(message: string): string {
    return this.notify('warning', message);
  }
  error(message: string): string {
    return this.notify('error', message);
  }

  dismiss(id: string): void {
    this.store.setState((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    }));
  }

  clear(): void {
    this.store.setState({ notifications: [] });
  }
}
