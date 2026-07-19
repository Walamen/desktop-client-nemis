import { DEFAULT_SEARCH_DEBOUNCE_MS } from '../constants/defaults';
import type { FilterDescriptor } from '../filters/filter-descriptor';

export interface SearchState {
  readonly keyword: string;
  readonly filters: readonly FilterDescriptor[];
  /** Debounce policy as data; the UI layer owns timers. */
  readonly debounceMs: number;
}

export function createSearch(debounceMs = DEFAULT_SEARCH_DEBOUNCE_MS): SearchState {
  return { keyword: '', filters: [], debounceMs };
}

export function withKeyword(s: SearchState, keyword: string): SearchState {
  return { ...s, keyword };
}

export function withFilters(s: SearchState, filters: readonly FilterDescriptor[]): SearchState {
  return { ...s, filters };
}

export function clearSearch(s: SearchState): SearchState {
  return { ...s, keyword: '', filters: [] };
}

/** Client-side keyword match over display fields. Used until server-backed
 * search lands (ListStudentsDto has no keyword yet — documented limitation). */
export function matchesKeyword(fields: readonly string[], keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (needle === '') return true;
  return fields.some((f) => f.toLowerCase().includes(needle));
}
