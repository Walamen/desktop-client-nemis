import { createStore } from 'zustand/vanilla';

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

export type DialogDescriptor =
  | { readonly kind: 'confirm'; readonly payload: ConfirmRequest }
  | { readonly kind: 'custom'; readonly name: string; readonly payload: unknown };

export interface DialogState {
  readonly current: DialogDescriptor | null;
}

export class DialogStore {
  readonly store = createStore<DialogState>(() => ({ current: null }));
  private pendingConfirm: ((result: boolean) => void) | null = null;

  open(name: string, payload?: unknown): void {
    // Opening any dialog cancels a pending confirm so its awaiter never orphans.
    this.pendingConfirm?.(false);
    this.pendingConfirm = null;
    this.store.setState({ current: { kind: 'custom', name, payload } });
  }

  /** Promise-based confirmation; the UI renders `current` and calls
   * resolveConfirm with the user's answer. */
  confirm(request: {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }): Promise<boolean> {
    this.pendingConfirm?.(false);
    const payload: ConfirmRequest = {
      title: request.title ?? 'Are you sure?',
      message: request.message,
      confirmLabel: request.confirmLabel ?? 'Confirm',
      cancelLabel: request.cancelLabel ?? 'Cancel',
    };
    this.store.setState({ current: { kind: 'confirm', payload } });
    return new Promise<boolean>((resolve) => {
      this.pendingConfirm = resolve;
    });
  }

  resolveConfirm(result: boolean): void {
    const resolve = this.pendingConfirm;
    this.pendingConfirm = null;
    this.store.setState({ current: null });
    resolve?.(result);
  }

  close(): void {
    if (this.pendingConfirm) {
      this.resolveConfirm(false);
      return;
    }
    this.store.setState({ current: null });
  }
}
