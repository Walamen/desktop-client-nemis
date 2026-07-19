import { createStore } from 'zustand/vanilla';
import type { RouteDescriptor, ScreenId } from '../navigation/route';

/** Framework-agnostic navigation source of truth; the real router (Next.js,
 * Phase 7) mirrors this store. */
export interface NavigationState {
  readonly current: RouteDescriptor;
  readonly history: readonly RouteDescriptor[];
}

export class NavigationStore {
  readonly store = createStore<NavigationState>(() => ({
    current: { screen: 'dashboard', params: {} },
    history: [],
  }));

  navigate(screen: ScreenId, params: Readonly<Record<string, string>> = {}): void {
    this.store.setState((s) => ({
      current: { screen, params },
      history: [...s.history, s.current],
    }));
  }

  back(): void {
    this.store.setState((s) => {
      const previous = s.history[s.history.length - 1];
      if (!previous) return s;
      return { current: previous, history: s.history.slice(0, -1) };
    });
  }
}
