import type { ApplicationResponse } from '@nemis-desktop/application';
import { toPresentationError, type PresentationError } from '../errors';
import type { NotificationStore } from '../stores/notification-store';
import { hasData, type AsyncState } from './async-state';

export interface QueryStateAccess<TView> {
  get(): AsyncState<TView>;
  set(next: AsyncState<TView>): void;
}

/** The single query pipeline: loading/refreshing → success | empty | error.
 * ViewModels never hand-roll try/catch around application calls. */
export async function trackQuery<TDto, TView>(opts: {
  access: QueryStateAccess<TView>;
  fetch: () => Promise<ApplicationResponse<TDto | null>>;
  map: (dto: TDto) => TView;
  isEmpty?: (view: TView) => boolean;
  onData?: (dto: TDto) => void;
}): Promise<void> {
  const current = opts.access.get();
  opts.access.set(
    hasData(current) ? { status: 'refreshing', data: current.data } : { status: 'loading' },
  );
  try {
    const res = await opts.fetch();
    if (res.data === null || res.data === undefined) {
      opts.access.set({ status: 'empty' });
      return;
    }
    opts.onData?.(res.data);
    const view = opts.map(res.data);
    opts.access.set(opts.isEmpty?.(view) ? { status: 'empty' } : { status: 'success', data: view });
  } catch (err) {
    opts.access.set({ status: 'error', error: toPresentationError(err, 'query') });
  }
}

export type CommandOutcome<TView> =
  | { readonly ok: true; readonly data: TView }
  | { readonly ok: false; readonly error: PresentationError };

/** The single command pipeline: run → map → notify. Never throws. */
export async function executeCommand<TDto, TView>(opts: {
  run: () => Promise<ApplicationResponse<TDto>>;
  map: (dto: TDto) => TView;
  notifications: NotificationStore;
  successMessage: string;
}): Promise<CommandOutcome<TView>> {
  try {
    const res = await opts.run();
    const data = opts.map(res.data);
    opts.notifications.success(opts.successMessage);
    for (const warning of res.warnings ?? []) opts.notifications.warning(warning);
    return { ok: true, data };
  } catch (err) {
    const error = toPresentationError(err, 'command');
    opts.notifications.error(error.userMessage);
    return { ok: false, error };
  }
}
