/** Events the main process pushes to the renderer on `nemis:event` — the
 * desktop's first main → renderer channel (live socket + sync). */
export type RealtimeEvent =
  | { type: 'message'; conversationId: string }
  | { type: 'notification' }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'synced' };

export const REALTIME_EVENT_CHANNEL = 'nemis:event';

export interface EventsApi {
  /** Listens for main-process events; returns the unsubscribe. */
  subscribe(listener: (event: RealtimeEvent) => void): () => void;
}
