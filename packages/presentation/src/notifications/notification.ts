export type NotificationKind = 'success' | 'info' | 'warning' | 'error';

/** Presentation-only notification (toast/banner). No Electron notifications. */
export interface UiNotification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly message: string;
  /** null = requires manual dismissal. */
  readonly autoDismissMs: number | null;
  readonly createdAt: number;
}

export const AUTO_DISMISS_MS: Readonly<Record<NotificationKind, number | null>> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: null,
};
