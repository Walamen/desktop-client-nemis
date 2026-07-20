'use client';

import type { StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';

/** The single bridge from a framework-free ViewModel store to React. Keeps
 * re-renders minimal via the selector. */
export function useViewModel<S, T>(store: StoreApi<S>, selector: (state: S) => T): T {
  return useStore(store, selector);
}
