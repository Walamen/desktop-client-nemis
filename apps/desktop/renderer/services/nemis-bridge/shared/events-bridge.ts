import type { RealtimeEvent } from '@nemis-desktop/types';
import { api } from '../api';

/** Main-process events (live socket). No bridge, or an older preload without
 * `events` (tests), is a no-op subscription. */
export const eventsBridge = {
  subscribe: (listener: (event: RealtimeEvent) => void): (() => void) => {
    let events: { subscribe(listener: (event: RealtimeEvent) => void): () => void } | undefined;
    try {
      events = (api() as { events?: typeof events }).events;
    } catch {
      events = undefined;
    }
    return events ? events.subscribe(listener) : () => undefined;
  },
};
