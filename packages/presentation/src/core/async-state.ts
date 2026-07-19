/** Minimal structural view of a presentation error, so core has no dependency
 * on the errors module. `PresentationError` (errors/) satisfies this. */
export interface PresentationErrorLike {
  readonly kind: string;
  readonly userMessage: string;
}

/** The standard request lifecycle every screen exposes. `refreshing` keeps the
 * previous data on screen while a reload is in flight. */
export type AsyncState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'refreshing'; readonly data: T }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly error: PresentationErrorLike };

export function idleState<T>(): AsyncState<T> {
  return { status: 'idle' };
}

export function hasData<T>(
  state: AsyncState<T>,
): state is Extract<AsyncState<T>, { readonly data: T }> {
  return state.status === 'success' || state.status === 'refreshing';
}

export function isBusy<T>(state: AsyncState<T>): boolean {
  return state.status === 'loading' || state.status === 'refreshing';
}

/** What the UI should render, combining a request state with global
 * connectivity/sync context. Offline never hides data already on screen;
 * syncing only decorates states that show data. */
export type ViewStatus =
  'idle' | 'loading' | 'refreshing' | 'success' | 'empty' | 'error' | 'offline' | 'syncing';

export interface ViewStatusContext {
  readonly isOffline: boolean;
  readonly isSyncing: boolean;
}

export function toViewStatus<T>(state: AsyncState<T>, ctx?: ViewStatusContext): ViewStatus {
  if (ctx?.isOffline && (state.status === 'idle' || state.status === 'error')) return 'offline';
  if (ctx?.isSyncing && hasData(state)) return 'syncing';
  return state.status;
}
