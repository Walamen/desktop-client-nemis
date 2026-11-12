/** Events the main process pushes to the renderer on `nemis:event` — the
 * desktop's first main → renderer channel (live socket + sync). */
export type RealtimeEvent =
  | { type: 'message'; conversationId: string }
  | { type: 'notification' }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'synced' }
  // the signed-in user was refreshed from `/auth/me`, or the session was revoked by the server
  | { type: 'session'; reason: 'refreshed' | 'revoked' };

export const REALTIME_EVENT_CHANNEL = 'nemis:event';

export interface EventsApi {
  /** Listens for main-process events; returns the unsubscribe. */
  subscribe(listener: (event: RealtimeEvent) => void): () => void;
}
