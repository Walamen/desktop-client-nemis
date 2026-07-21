import { createStore } from 'zustand/vanilla';

export type BootstrapPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface BootstrapState {
  readonly phase: BootstrapPhase;
  readonly total: number;
  readonly done: readonly string[];
  readonly failed: readonly string[];
}

/** Observable progress of the renderer's startup data-loading sequence.
 * Written only by BootstrapService; read by RootProviders to decide between
 * the loading splash, the app, and the database-unavailable panel. */
export class BootstrapStore {
  readonly store = createStore<BootstrapState>(() => ({
    phase: 'idle',
    total: 0,
    done: [],
    failed: [],
  }));

  start(names: readonly string[]): void {
    this.store.setState({ phase: 'loading', total: names.length, done: [], failed: [] });
  }
  markDone(name: string): void {
    this.store.setState((s) => ({ done: [...s.done, name] }));
  }
  markFailed(name: string): void {
    this.store.setState((s) => ({ failed: [...s.failed, name] }));
  }
  /** Total failure (nothing loaded) → error; otherwise ready, even if some
   * individual loads failed (their tiles show their own error/empty states). */
  finish(): void {
    this.store.setState((s) => ({ phase: s.total > 0 && s.done.length === 0 ? 'error' : 'ready' }));
  }
}
