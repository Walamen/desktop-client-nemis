/** Semantic badge names; the UI maps these to the enterprise palette.
 * Presentation never emits hex colors. */
export type BadgeToken = 'success' | 'active' | 'pending' | 'error' | 'neutral';

export interface StatusPresentation {
  readonly label: string;
  readonly badge: BadgeToken;
}

/** Background sync lifecycle as shown to users. Owned here so both the
 * connectivity store and presenters can use it without a cycle. */
export type SyncStatus = 'idle' | 'syncing' | 'failed';
